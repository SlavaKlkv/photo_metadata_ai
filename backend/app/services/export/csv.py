import csv
from io import StringIO

import structlog

from app.core.enums import FileStatus, StockPlatform
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.stock_metadata import (
    StockMappedMetadata,
    build_stock_mapped_metadata,
)

logger = structlog.get_logger(__name__)


CSV_HEADERS: dict[StockPlatform, list[str]] = {
    StockPlatform.SHUTTERSTOCK: [
        'Filename',
        'Title',
        'Description',
        'Keywords',
        'Categories',
        'Illustration',
        'Mature Content',
        'Editorial',
        'Location',
        'Releases',
    ],
    StockPlatform.GETTY_IMAGES: [
        'Filename',
        'Title',
        'Description',
        'Keywords',
        'Categories',
        'Editorial',
        'Location',
        'Releases',
    ],
    StockPlatform.ADOBE_STOCK: [
        'Filename',
        'Title',
        'Description',
        'Keywords',
        'Category',
        'Editorial',
        'Location',
        'Releases',
    ],
}


def generate_metadata_csv(
    job: ProcessingJob,
    export_platform: StockPlatform | None = None,
) -> str:
    """
    Генерирует CSV с метаданными файлов в формате выбранной платформы.
    """
    if export_platform is None:
        export_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(CSV_HEADERS[export_platform])

    export_files = [
        file
        for file in job.files
        if file.status == FileStatus.COMPLETED and file.selected_for_export
    ]

    for file in export_files:
        writer.writerow(_build_csv_row(file, export_platform))

    csv_content = output.getvalue()

    logger.info(
        'csv_generation_completed',
        job_id=str(job.job_id),
        export_platform=export_platform,
        files_count=len(export_files),
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
    export_platform: StockPlatform,
) -> list[str]:
    """
    Преобразует файл задачи в строку CSV нужного формата.
    """

    mapped_metadata = build_stock_mapped_metadata(file, export_platform)
    keywords = _format_keywords(mapped_metadata.keywords)
    title = mapped_metadata.title or ''
    description = mapped_metadata.description or ''
    categories_value = _format_list(mapped_metadata.categories)
    primary_category = (
        mapped_metadata.categories[0] if mapped_metadata.categories else ''
    )
    editorial = _format_bool(mapped_metadata.is_editorial)
    location = mapped_metadata.location_metadata or ''
    releases = _format_releases(mapped_metadata)

    if export_platform == StockPlatform.SHUTTERSTOCK:
        return [
            file.filename,
            title,
            description,
            keywords,
            categories_value,
            _format_bool(mapped_metadata.is_illustration),
            _format_bool(mapped_metadata.mature_content),
            editorial,
            location,
            releases,
        ]

    if export_platform == StockPlatform.GETTY_IMAGES:
        return [
            file.filename,
            title,
            description,
            keywords,
            categories_value,
            editorial,
            location,
            releases,
        ]

    if export_platform == StockPlatform.ADOBE_STOCK:
        return [
            file.filename,
            title,
            description,
            keywords,
            primary_category,
            editorial,
            location,
            releases,
        ]

    logger.warning(
        'unsupported_stock_platform_for_csv_row',
        stock_platform=export_platform,
    )

    return [file.filename, title, description, keywords]


def _format_bool(value: bool | None) -> str:
    """
    Приводит boolean к ожидаемому CSV-представлению.
    """
    if value:
        return 'Yes'
    if value is False:
        return 'No'

    return ''


def _format_list(values: list[str]) -> str:
    """
    Форматирует список в одну CSV-ячейку.
    """
    return ' | '.join(value for value in values if value.strip())


def _format_keywords(keywords: list[str]) -> str:
    """
    Объединяет ключевые слова в значение одной CSV-ячейки.
    """

    return ', '.join(
        keyword.strip() for keyword in keywords if keyword.strip()
    )


def _format_releases(mapped_metadata: StockMappedMetadata) -> str:
    """
    Форматирует release-данные для CSV.
    """
    if mapped_metadata.releases:
        return _format_list(mapped_metadata.releases)

    if mapped_metadata.model_release_available:
        return 'Yes'

    if mapped_metadata.model_release_available is False:
        return 'No'

    return ''
