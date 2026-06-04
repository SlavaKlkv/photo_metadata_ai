import asyncio
from pathlib import Path
from typing import TypedDict
from uuid import UUID

import structlog
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from app.core.constants import RESULTS_DIR
from app.core.enums import (
    ExportFormat,
    ExportStatus,
    FileStatus,
    StockPlatform,
)
from app.core.runtime import resolve_path_in_base
from app.schemas.export import ExportArtifact
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.export.csv import generate_metadata_csv
from app.services.metadata.metadata_embedding import (
    embed_metadata_into_jpg,
    get_upload_file_path,
)
from app.services.metadata.stock_metadata import (
    build_stock_iptc_payload,
    validate_file_metadata_for_stock,
)
from app.storage.jobs import storage

logger = structlog.get_logger(__name__)

SUPPORTED_EXPORT_FORMATS = (
    ExportFormat.CSV,
    ExportFormat.IPTC,
)


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
    job_result_dir = resolve_path_in_base(RESULTS_DIR, str(job.job_id))
    filename = get_export_filename(job, export_format, export_platform)
    return resolve_path_in_base(job_result_dir, filename)


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

    job.export_status = ExportStatus.PROCESSING
    job.export_progress = 50
    job.export_format = requested_export_format
    job.export_error_message = None
    job.export_artifacts = []
    await storage.update_job(job)

    try:
        export_artifacts = await run_in_threadpool(
            ensure_job_exports,
            job,
            requested_export_format,
        )
    except asyncio.CancelledError:
        job.export_status = ExportStatus.CANCELLED
        job.export_progress = 100
        job.export_error_message = 'Export cancelled'
        job.export_artifacts = []
        await storage.update_job(job)
        logger.info(
            'job_export_cancelled_by_task',
            job_id=str(job_id),
        )
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


def ensure_job_exports(
    job: ProcessingJob,
    requested_export_format: ExportFormat,
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
    export_artifacts: list[ExportArtifact] = []

    for export_format in export_formats:
        if export_format == ExportFormat.CSV:
            csv_path = ensure_job_export(job, ExportFormat.CSV)
            export_artifacts.append(
                _build_file_export_artifact(
                    csv_path,
                    export_format=ExportFormat.CSV,
                    count=completed_files_count,
                )
            )
            continue

        if export_format == ExportFormat.IPTC:
            export_artifacts.extend(_ensure_iptc_export(job))
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


def _ensure_iptc_export(job: ProcessingJob) -> list[ExportArtifact]:
    iptc_artifacts: list[ExportArtifact] = []
    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK

    for file in job.files:
        if file.status != FileStatus.COMPLETED or not file.selected_for_export:
            continue

        if not file.iptc_embedded_metadata:
            iptc_payload = build_stock_iptc_payload(file, stock_platform)
            embed_metadata_into_jpg(file, payload=iptc_payload)
            file.iptc_embedded_metadata = True

        file_path = get_upload_file_path(file.filename)

        if not file_path.is_file():
            raise ValueError(
                f'IPTC export file not found: {file.original_filename}'
            )

        iptc_artifacts.append(
            _build_file_export_artifact(
                file_path,
                export_format=ExportFormat.IPTC,
            )
        )

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
