from app.core.enums import ExportFormat, StockPlatform

SUPPORTED_EXPORT_FORMATS = (
    ExportFormat.CSV,
    ExportFormat.IPTC,
)

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
        'Category 1',
        'Category 2',
        'License Type',
        'Editorial',
        'Editorial Caption',
        'Editorial Date',
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
        'Editorial Caption',
        'Location',
        'Releases',
        'AI Disclosure',
        'Illustration',
        'Mature Content',
    ],
}
