import asyncio
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypedDict
from uuid import UUID

import structlog
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from app.core.enums import (
    ExportFormat,
    ExportStatus,
    FileStatus,
    StockPlatform,
)
from app.core.runtime import get_runtime_directories, resolve_path_in_base
from app.schemas.export import ExportArtifact
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.export.constants import SUPPORTED_EXPORT_FORMATS
from app.services.export.csv import generate_metadata_csv
from app.services.metadata.metadata_embedding import (
    embed_metadata_into_jpg,
    get_upload_file_path,
)
from app.services.metadata.stock_mapping import build_stock_iptc_payload
from app.services.metadata.stock_validation import (
    validate_file_metadata_for_stock,
)
from app.storage.jobs import storage

logger = structlog.get_logger(__name__)

# Запись файлов идёт в отдельном потоке через run_in_threadpool, а отмена
# корутины поток не останавливает — без явного флага экспорт дописывал файлы
# уже после нажатия Cancel. Флаг проверяется между форматами и между файлами
_cancelled_export_job_ids: set[UUID] = set()


class ExportCancelledError(Exception):
    """Экспорт прерван по запросу пользователя."""


def request_export_cancellation(job_id: UUID) -> None:
    _cancelled_export_job_ids.add(job_id)


def clear_export_cancellation(job_id: UUID) -> None:
    _cancelled_export_job_ids.discard(job_id)


def is_export_cancelled(job_id: UUID) -> bool:
    return job_id in _cancelled_export_job_ids


def _raise_if_export_cancelled(job_id: UUID) -> None:
    if is_export_cancelled(job_id):
        raise ExportCancelledError


@dataclass
class _PreExportSnapshot:
    """
    Состояние задачи до старта экспорта — по нему откатывается отмена.

    Живёт на уровне модуля, а не в замыкании run_job_export: экспорт часто
    успевает завершиться раньше, чем доедет запрос на отмену, и откатывать
    приходится уже из эндпоинта, у которого доступа к тому замыканию нет.
    """

    files: set[Path] = field(default_factory=set)
    artifacts: list[ExportArtifact] = field(default_factory=list)
    iptc_flags: dict[UUID, bool] = field(default_factory=dict)
    status: ExportStatus | None = None
    export_format: ExportFormat | None = None


_pre_export_snapshots: dict[UUID, _PreExportSnapshot] = {}


def _capture_pre_export_snapshot(job: ProcessingJob) -> _PreExportSnapshot:
    snapshot = _PreExportSnapshot(
        files=_snapshot_existing_artifacts(job),
        artifacts=list(job.export_artifacts),
        iptc_flags={
            file.file_id: file.iptc_embedded_metadata for file in job.files
        },
        status=job.export_status,
        export_format=job.export_format,
    )
    _pre_export_snapshots[job.job_id] = snapshot
    return snapshot


def discard_pre_export_snapshot(job_id: UUID) -> None:
    _pre_export_snapshots.pop(job_id, None)


def _get_job_results_dir(job: ProcessingJob) -> Path:
    results_dir = get_runtime_directories().results_dir
    return resolve_path_in_base(results_dir, str(job.job_id))


def _snapshot_existing_artifacts(job: ProcessingJob) -> set[Path]:
    """
    Фиксирует файлы, лежавшие в директории результатов до старта экспорта.

    По этому снимку откат удаляет только то, что записал прерванный прогон,
    и не трогает артефакты предыдущего успешного экспорта.
    """
    job_results_dir = _get_job_results_dir(job)

    if not job_results_dir.is_dir():
        return set()

    return {path for path in job_results_dir.iterdir() if path.is_file()}


def _rollback_export_artifacts(
    job: ProcessingJob,
    snapshot: _PreExportSnapshot,
) -> None:
    """
    Возвращает задачу в состояние «до экспорта»: удаляет записанное этим
    прогоном и снимает выставленные им отметки об IPTC.
    """
    job_results_dir = _get_job_results_dir(job)

    if job_results_dir.is_dir():
        for path in job_results_dir.iterdir():
            if not path.is_file() or path in snapshot.files:
                continue

            try:
                path.unlink()
            except OSError as error:
                # Не роняем откат из-за одного файла: остальное всё равно
                # надо убрать, а расхождение видно в логах
                logger.warning(
                    'job_export_rollback_unlink_failed',
                    job_id=str(job.job_id),
                    path=str(path),
                    error=str(error),
                )

        # Если прерванный прогон был первым (прошлых артефактов нет),
        # после чистки папка пустеет — убираем её целиком, чтобы отмена
        # не оставляла даже пустой каталог результатов
        try:
            next(job_results_dir.iterdir())
        except StopIteration:
            try:
                job_results_dir.rmdir()
            except OSError as error:
                logger.warning(
                    'job_export_rollback_rmdir_failed',
                    job_id=str(job.job_id),
                    path=str(job_results_dir),
                    error=str(error),
                )

    for file in job.files:
        file.iptc_embedded_metadata = snapshot.iptc_flags.get(
            file.file_id,
            False,
        )


async def rollback_export(job: ProcessingJob) -> ProcessingJob:
    """
    Откатывает экспорт задачи к состоянию «до старта» и помечает CANCELLED.

    Идемпотентна: работает и для прерванного на середине прогона, и для
    экспорта, успевшего завершиться раньше, чем доехала отмена. Без снимка
    (экспорт не запускался) просто выставляет статус CANCELLED.
    """
    snapshot = _pre_export_snapshots.get(job.job_id, _PreExportSnapshot())

    await run_in_threadpool(_rollback_export_artifacts, job, snapshot)

    job.export_status = ExportStatus.CANCELLED
    job.export_progress = 0
    job.export_error_message = 'Export cancelled'
    job.export_artifacts = snapshot.artifacts
    job.export_format = snapshot.export_format
    await storage.update_job(job)

    discard_pre_export_snapshot(job.job_id)
    return job


class _ExportProgress:
    """
    Считает долю записанных единиц экспорта и репортит её в проценты.

    Единица — один IPTC-файл или один CSV: прогресс отражает реально
    записанное, а не фиксированные 50%, как было раньше.
    """

    def __init__(
        self,
        total_units: int,
        callback: Callable[[int], None] | None,
    ) -> None:
        self._total = max(total_units, 1)
        self._done = 0
        self._callback = callback

    def advance(self, units: int = 1) -> None:
        self._done += units
        if self._callback is not None:
            percent = min(int(self._done / self._total * 100), 100)
            self._callback(percent)


class ExportValidationError(TypedDict):
    filename: str
    errors: list[str]


def generate_job_export(
    job: ProcessingJob,
    export_format: ExportFormat,
) -> tuple[str, str, str]:
    """
    Генерирует экспорт задачи в выбранном формате.
    """
    if export_format == ExportFormat.CSV:
        stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK
        selected_completed_files = [
            file
            for file in job.files
            if file.status == FileStatus.COMPLETED and file.selected_for_export
        ]
        validation_errors = _collect_export_validation_errors(
            selected_completed_files,
            stock_platform,
        )

        if validation_errors:
            raise ValueError(
                _format_export_validation_error(validation_errors)
            )

        csv_content = generate_metadata_csv(job)
        filename = get_export_filename(job, export_format)
        return csv_content, filename, 'text/csv; charset=utf-8'

    raise ValueError(f'Unsupported export format: {export_format}')


def get_export_filename(
    job: ProcessingJob,
    export_format: ExportFormat,
    export_platform: StockPlatform | None = None,
) -> str:
    """
    Формирует безопасное имя файла для скачивания результата экспорта.
    """
    if export_format == ExportFormat.CSV:
        if export_platform is None:
            export_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK

        return f'{job.job_id}_{export_platform}.csv'

    return f'{job.job_id}_{export_format}'


def get_job_export_path(
    job: ProcessingJob,
    export_format: ExportFormat,
    export_platform: StockPlatform | None = None,
) -> Path:
    """
    Возвращает путь к файлу экспорта задачи в директории результатов.
    """
    results_dir = get_runtime_directories().results_dir
    job_result_dir = resolve_path_in_base(results_dir, str(job.job_id))
    filename = get_export_filename(job, export_format, export_platform)
    return resolve_path_in_base(job_result_dir, filename)


def get_job_iptc_export_path(
    job: ProcessingJob,
    file: ProcessingJobFile,
) -> Path:
    """
    Возвращает путь к JPG/IPTC artifact в директории результатов задачи.

    Имя берётся из оригинального, а не из внутреннего (с UUID-префиксом):
    в папке результатов пользователь должен узнавать свои фотографии.
    Дубликаты имён внутри задачи запрещены на загрузке, поэтому
    коллизий здесь не возникает.
    """
    results_dir = get_runtime_directories().results_dir
    job_result_dir = resolve_path_in_base(results_dir, str(job.job_id))
    safe_filename = Path(file.original_filename or file.filename).name

    try:
        return resolve_path_in_base(job_result_dir, safe_filename)
    except ValueError:
        # оригинальное имя оказалось небезопасным — падать из-за этого
        # незачем, внутреннее имя всегда валидно
        return resolve_path_in_base(job_result_dir, Path(file.filename).name)


def store_job_export(
    job: ProcessingJob,
    export_format: ExportFormat,
) -> Path:
    """
    Генерирует и сохраняет экспорт задачи на диск.
    """
    content, _, _ = generate_job_export(job, export_format)
    export_path = get_job_export_path(job, export_format)

    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(content, encoding='utf-8')

    logger.info(
        'job_export_written',
        job_id=str(job.job_id),
        export_format=export_format,
        export_path=str(export_path),
    )
    return export_path


def ensure_job_export(
    job: ProcessingJob,
    export_format: ExportFormat,
) -> Path:
    """
    Всегда пересобирает export на основе актуального состояния metadata.
    """
    return store_job_export(job, export_format)


def load_stored_job_export(
    job: ProcessingJob,
    export_format: ExportFormat,
) -> tuple[str, str, str] | None:
    """
    Загружает ранее сохраненный экспорт задачи, если файл существует.
    """
    export_path = get_job_export_path(job, export_format)

    if not export_path.is_file():
        return None

    if export_format == ExportFormat.CSV:
        return (
            export_path.read_text(encoding='utf-8'),
            export_path.name,
            'text/csv; charset=utf-8',
        )

    raise ValueError(f'Unsupported export format: {export_format}')


async def run_job_export(
    job_id: UUID,
    requested_export_format: ExportFormat,
) -> None:
    """
    Выполняет подготовку экспорта задачи в фоне.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    # Флаг мог остаться от предыдущей отмены — иначе новый экспорт того же
    # джоба немедленно прервался бы
    clear_export_cancellation(job_id)

    # Снимок состояния «до экспорта» — по нему откатываем отменённый прогон.
    # Хранится на уровне модуля: если экспорт успеет завершиться раньше
    # отмены, откатывать будет эндпоинт, у которого нет этого контекста
    _capture_pre_export_snapshot(job)

    job.export_status = ExportStatus.PROCESSING
    job.export_progress = 0
    job.export_format = requested_export_format
    job.export_error_message = None
    job.export_artifacts = []
    await storage.update_job(job)

    # Колбэк вызывается из потока run_in_threadpool. Хранилище держит тот же
    # объект job в памяти, что читает polling-эндпоинт, поэтому мутации
    # export_progress достаточно — присваивание int атомарно под GIL
    def report_progress(percent: int) -> None:
        job.export_progress = percent

    try:
        export_artifacts = await run_in_threadpool(
            ensure_job_exports,
            job,
            requested_export_format,
            report_progress,
        )
    except ExportCancelledError:
        await rollback_export(job)
        logger.info('job_export_cancelled_by_request', job_id=str(job_id))
        return
    except asyncio.CancelledError:
        # shield: задача уже отменена, и без него первый же await внутри
        # отката снова бросил бы CancelledError, оставив файлы на диске
        await asyncio.shield(rollback_export(job))
        logger.info('job_export_cancelled_by_task', job_id=str(job_id))
        raise
    except (ValueError, OSError, HTTPException) as error:
        job.export_status = ExportStatus.FAILED
        job.export_progress = 100
        job.export_error_message = _extract_export_error_message(error)
        job.export_artifacts = []
        await storage.update_job(job)
        return
    except Exception as error:
        logger.exception(
            'job_export_failed_unexpected',
            job_id=str(job_id),
            error=str(error),
        )
        job.export_status = ExportStatus.FAILED
        job.export_progress = 100
        job.export_error_message = 'Unexpected export error'
        job.export_artifacts = []
        await storage.update_job(job)
        return

    job.export_status = ExportStatus.COMPLETED
    job.export_progress = 100
    job.export_error_message = None
    job.export_artifacts = export_artifacts
    await storage.update_job(job)
    clear_export_cancellation(job_id)


def ensure_job_exports(
    job: ProcessingJob,
    requested_export_format: ExportFormat,
    progress_callback: Callable[[int], None] | None = None,
) -> list[ExportArtifact]:
    """
    Обеспечивает экспорт всех форматов, выбранных в настройках задачи.
    """
    completed_files_count = _count_selected_completed_files(job)
    if completed_files_count == 0:
        raise ValueError('No selected completed files available for export')

    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK
    selected_completed_files = [
        file
        for file in job.files
        if file.status == FileStatus.COMPLETED and file.selected_for_export
    ]
    validation_errors = _collect_export_validation_errors(
        selected_completed_files,
        stock_platform,
    )

    if validation_errors:
        raise ValueError(_format_export_validation_error(validation_errors))

    export_formats = _resolve_export_formats(
        job,
        requested_export_format,
    )

    # Единиц прогресса: CSV — одна на весь файл, IPTC — по файлу
    total_units = sum(
        completed_files_count
        if export_format == ExportFormat.IPTC
        else 1
        for export_format in export_formats
    )
    progress = _ExportProgress(total_units, progress_callback)

    export_artifacts: list[ExportArtifact] = []

    for export_format in export_formats:
        _raise_if_export_cancelled(job.job_id)

        if export_format == ExportFormat.CSV:
            csv_path = ensure_job_export(job, ExportFormat.CSV)
            export_artifacts.append(
                _build_file_export_artifact(
                    csv_path,
                    export_format=ExportFormat.CSV,
                    count=completed_files_count,
                )
            )
            progress.advance()
            continue

        if export_format == ExportFormat.IPTC:
            export_artifacts.extend(_ensure_iptc_export(job, progress))
            continue

        raise ValueError(f'Unsupported export format: {export_format}')

    return export_artifacts


def _resolve_export_formats(
    job: ProcessingJob,
    requested_export_format: ExportFormat,
) -> list[ExportFormat]:
    settings_export_formats = [
        export_format
        for export_format in job.export_formats
        if export_format in SUPPORTED_EXPORT_FORMATS
    ]

    if settings_export_formats:
        return list(dict.fromkeys(settings_export_formats))

    if requested_export_format not in SUPPORTED_EXPORT_FORMATS:
        raise ValueError(
            f'Unsupported export format: {requested_export_format}'
        )

    return [requested_export_format]


def _ensure_iptc_export(
    job: ProcessingJob,
    progress: '_ExportProgress | None' = None,
) -> list[ExportArtifact]:
    iptc_artifacts: list[ExportArtifact] = []
    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK

    for file in job.files:
        if file.status != FileStatus.COMPLETED or not file.selected_for_export:
            continue

        # На больших пачках это самый долгий цикл — без проверки на каждом
        # файле Cancel не успевал остановить запись
        _raise_if_export_cancelled(job.job_id)

        iptc_payload = build_stock_iptc_payload(file, stock_platform)
        upload_file_path = get_upload_file_path(file.filename)

        if not upload_file_path.is_file():
            raise ValueError(
                f'IPTC export file not found: {file.original_filename}'
            )

        export_file_path = get_job_iptc_export_path(job, file)
        export_file_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(upload_file_path, export_file_path)

        embed_metadata_into_jpg(
            file,
            payload=iptc_payload,
            file_path=export_file_path,
        )
        file.iptc_embedded_metadata = True

        iptc_artifacts.append(
            _build_file_export_artifact(
                export_file_path,
                export_format=ExportFormat.IPTC,
            )
        )

        if progress is not None:
            progress.advance()

    return iptc_artifacts


def _build_file_export_artifact(
    file_path: Path,
    *,
    export_format: ExportFormat,
    count: int = 1,
) -> ExportArtifact:
    return ExportArtifact(
        export_format=export_format,
        path=str(file_path),
        filename=file_path.name,
        size_bytes=file_path.stat().st_size,
        count=count,
    )


def _count_completed_files(job: ProcessingJob) -> int:
    return sum(1 for file in job.files if file.status == FileStatus.COMPLETED)


def _collect_export_validation_errors(
    files: list[ProcessingJobFile],
    stock_platform: StockPlatform,
) -> list[ExportValidationError]:

    validation_errors: list[ExportValidationError] = []

    for file in files:
        validation_result = validate_file_metadata_for_stock(
            file,
            stock_platform,
        )

        if not validation_result.errors:
            continue

        validation_errors.append(
            {
                'filename': file.original_filename,
                'errors': [
                    issue.message for issue in validation_result.errors
                ],
            }
        )

    return validation_errors


def _count_selected_completed_files(job: ProcessingJob) -> int:
    return sum(
        1
        for file in job.files
        if file.status == FileStatus.COMPLETED and file.selected_for_export
    )


def _format_export_validation_error(
    validation_errors: list[ExportValidationError],
) -> str:
    preview_messages: list[str] = []

    for file_error in validation_errors[:3]:
        filename = file_error['filename']
        errors = file_error['errors']
        first_error = errors[0] if errors else 'unknown validation error'
        preview_messages.append(f'{filename}: {first_error}')

    preview = '; '.join(preview_messages)
    hidden_count = len(validation_errors) - len(preview_messages)

    if hidden_count > 0:
        preview = f'{preview}; and {hidden_count} more files'

    return (
        f'Export is blocked because metadata has validation errors: {preview}'
    )


def _extract_export_error_message(
    error: ValueError | OSError | HTTPException,
) -> str:
    if isinstance(error, HTTPException):
        detail = getattr(error, 'detail', None)
        if isinstance(detail, str):
            return detail
        return 'Export failed'

    return str(error)
