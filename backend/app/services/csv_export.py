import csv
from io import StringIO

from app.schemas.job import ProcessingJob, ProcessingJobFile, StockPlatform

import structlog

logger = structlog.get_logger(__name__)


CSV_HEADERS: dict[CsvExportFormat, list[str]] = {
    CsvExportFormat.SHUTTERSTOCK: [
        'Filename',
        'Description',
        'Keywords',
        'Categories',
        'Illustration',
        'Mature Content',
        'Editorial',
    ],
    StockPlatform.GETTY_IMAGES: [
        'Filename',
        'Title',
        'Description',
        'Keywords',
    ],
    StockPlatform.ADOBE_STOCK: [
        'Filename',
        'Title',
        'Keywords',
        'Category',
        'Releases',
    ],
}


def generate_metadata_csv(
    job: ProcessingJob,
    export_format: StockPlatform | None = None,
) -> str:
    """
    Генерирует CSV с метаданными файлов в формате выбранной платформы.
    """
    if export_format is None:
        export_format = _resolve_export_format(job)

    logger.info(
        'csv_generation_started',
        job_id=str(job.job_id),
        export_format=export_format,
        files_count=len(job.files),
    )

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(CSV_HEADERS[export_format])

    for file in job.files:
        writer.writerow(_build_csv_row(file, export_format))

    csv_content = output.getvalue()

    logger.info(
        'csv_generation_completed',
        job_id=str(job.job_id),
        export_format=export_format,
        files_count=len(job.files),
        csv_size=len(csv_content),
    )

    return csv_content


def get_csv_filename(
    job: ProcessingJob,
    export_format: StockPlatform,
) -> str:
    """
    Формирует безопасное имя CSV-файла для скачивания.
    """

    filename = f'{job.job_id}_{export_format}.csv'

    logger.debug(
        'csv_filename_generated',
        job_id=str(job.job_id),
        export_format=export_format,
        filename=filename,
    )

    return filename


def _resolve_export_format(job: ProcessingJob) -> StockPlatform:
    """
    Определяет формат CSV на основе настроек задачи.
    """

    stock_platform = (job.stock_platform or '').lower()

    try:
        return StockPlatform(stock_platform)
    except ValueError:
        return StockPlatform.SHUTTERSTOCK


def _build_csv_row(
    file: ProcessingJobFile,
    export_format: StockPlatform,
) -> list[str]:
    """
    Преобразует файл задачи в строку CSV нужного формата.
    """

    keywords = _format_keywords(file.keywords)
    title = file.title or ''  # защита от None
    description = file.description or title

    if export_format == StockPlatform.SHUTTERSTOCK:
        return [
            file.filename,
            description,
            keywords,
            '',
            '',
            '',
            '',
        ]

    if export_format == StockPlatform.GETTY_IMAGES:
        return [
            file.filename,
            title,
            description,
            keywords,
        ]

    return [
        file.filename,
        title,
        keywords,
        '',
        '',
    ]


def _format_keywords(keywords: list[str]) -> str:
    """
    Объединяет ключевые слова в значение одной CSV-ячейки.
    """

    return ', '.join(
        keyword.strip() for keyword in keywords if keyword.strip()
    )
