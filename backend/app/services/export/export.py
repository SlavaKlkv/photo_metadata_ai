from uuid import UUID

from starlette.concurrency import run_in_threadpool

from app.core.enums import ExportFormat, ExportStatus, StockPlatform
from app.schemas.job import ProcessingJob
from app.services.export.csv import generate_metadata_csv
from app.services.storage import storage


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
        await run_in_threadpool(generate_job_export, job, export_format)
    except ValueError as error:
        job.export_status = ExportStatus.FAILED
        job.export_progress = 100
        job.export_error_message = str(error)
        await storage.update_job(job)
        return

    job.export_status = ExportStatus.COMPLETED
    job.export_progress = 100
    job.export_error_message = None
    await storage.update_job(job)
