from pathlib import Path
from uuid import UUID

import structlog
from starlette.concurrency import run_in_threadpool

from app.core.constants import RESULTS_DIR
from app.core.enums import ExportFormat, ExportStatus, StockPlatform
from app.core.runtime import resolve_path_in_base
from app.schemas.job import ProcessingJob
from app.services.export.csv import generate_metadata_csv
from app.services.storage import storage

logger = structlog.get_logger(__name__)


def generate_job_export(
    job: ProcessingJob,
    export_format: ExportFormat,
) -> tuple[str, str, str]:
    """
    Генерирует экспорт задачи в выбранном формате.
    """
    if export_format == ExportFormat.CSV:
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
    Возвращает существующий экспорт задачи или создает новый,
    если файла еще нет.
    """
    export_path = get_job_export_path(job, export_format)

    if export_path.is_file():
        logger.info(
            'job_export_reused',
            job_id=str(job.job_id),
            export_format=export_format,
            export_path=str(export_path),
        )
        return export_path

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
    export_format: ExportFormat,
) -> None:
    """
    Выполняет подготовку экспорта задачи в фоне.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.export_status = ExportStatus.PROCESSING
    job.export_progress = 50
    job.export_error_message = None
    await storage.update_job(job)

    try:
        await run_in_threadpool(ensure_job_export, job, export_format)
    except (ValueError, OSError) as error:
        job.export_status = ExportStatus.FAILED
        job.export_progress = 100
        job.export_error_message = str(error)
        await storage.update_job(job)
        return

    job.export_status = ExportStatus.COMPLETED
    job.export_progress = 100
    job.export_error_message = None
    await storage.update_job(job)
