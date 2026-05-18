import csv
from io import StringIO

from app.schemas.job import ProcessingJob, ProcessingJobFile, StockPlatform

CSV_HEADERS: dict[StockPlatform, list[str]] = {
    StockPlatform.SHUTTERSTOCK: [
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
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(CSV_HEADERS[export_format])

    for file in job.files:
        writer.writerow(_build_csv_row(file, export_format))

    return output.getvalue()


def get_csv_filename(
    job: ProcessingJob,
    export_format: StockPlatform,
) -> str:
    """
    Формирует безопасное имя CSV-файла для скачивания.
    """

    return f'{job.job_id}_{export_format}.csv'


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
