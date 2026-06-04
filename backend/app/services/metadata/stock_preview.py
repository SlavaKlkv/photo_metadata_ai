from app.core.enums import StockPlatform
from app.schemas.job import (
    ProcessingJobFile,
    StockAwareMetadataPreview,
    StockPreviewField,
    StockSpecificPreviewBlock,
)
from app.services.metadata.stock_mapping import build_stock_mapped_metadata
from app.services.metadata.stock_validation import (
    validate_file_metadata_for_stock,
)


def build_stock_aware_preview(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> StockAwareMetadataPreview:
    """
    Формирует stock-aware preview только с релевантными полями платформы.
    """
    mapped = build_stock_mapped_metadata(file, stock_platform)
    validation = validate_file_metadata_for_stock(file, stock_platform)

    common_fields = [
        StockPreviewField(
            key='filename',
            label='Filename',
            value=file.original_filename,
        ),
        StockPreviewField(
            key='title',
            label='Title',
            value=mapped.title or '',
        ),
        StockPreviewField(
            key='description',
            label='Description',
            value=mapped.description or '',
        ),
        StockPreviewField(
            key='keywords',
            label='Keywords',
            value=list(mapped.keywords),
        ),
    ]

    if stock_platform == StockPlatform.SHUTTERSTOCK:
        stock_specific = StockSpecificPreviewBlock(
            title='Shutterstock Specific',
            fields=[
                StockPreviewField(
                    key='categories',
                    label='Categories',
                    value=list(mapped.categories),
                ),
                StockPreviewField(
                    key='category_2',
                    label='Category 2',
                    value=mapped.category_2,
                ),
                StockPreviewField(
                    key='is_illustration',
                    label='Illustration',
                    value=mapped.is_illustration,
                ),
                StockPreviewField(
                    key='mature_content',
                    label='Mature Content',
                    value=mapped.mature_content,
                ),
                StockPreviewField(
                    key='is_editorial',
                    label='Editorial',
                    value=mapped.is_editorial,
                ),
                StockPreviewField(
                    key='location_metadata',
                    label='Location',
                    value=mapped.location_metadata,
                ),
                StockPreviewField(
                    key='releases',
                    label='Releases',
                    value=list(mapped.releases),
                ),
            ],
        )
    elif stock_platform == StockPlatform.GETTY_IMAGES:
        stock_specific = StockSpecificPreviewBlock(
            title='Getty Specific',
            fields=[
                StockPreviewField(
                    key='categories',
                    label='Categories',
                    value=list(mapped.categories),
                ),
                StockPreviewField(
                    key='category_2',
                    label='Category 2',
                    value=mapped.category_2,
                ),
                StockPreviewField(
                    key='license_type',
                    label='License Type',
                    value=mapped.license_type,
                ),
                StockPreviewField(
                    key='is_editorial',
                    label='Editorial',
                    value=mapped.is_editorial,
                ),
                StockPreviewField(
                    key='editorial_caption',
                    label='Editorial Caption',
                    value=mapped.editorial_caption,
                ),
                StockPreviewField(
                    key='editorial_date',
                    label='Editorial Date',
                    value=mapped.editorial_date,
                ),
                StockPreviewField(
                    key='location_metadata',
                    label='Location',
                    value=mapped.location_metadata,
                ),
                StockPreviewField(
                    key='releases',
                    label='Releases',
                    value=list(mapped.releases),
                ),
            ],
        )
    else:
        stock_specific = StockSpecificPreviewBlock(
            title='Adobe Specific',
            fields=[
                StockPreviewField(
                    key='category',
                    label='Category',
                    value=mapped.categories[0] if mapped.categories else None,
                ),
                StockPreviewField(
                    key='is_editorial',
                    label='Editorial',
                    value=mapped.is_editorial,
                ),
                StockPreviewField(
                    key='editorial_caption',
                    label='Editorial Caption',
                    value=mapped.editorial_caption,
                ),
                StockPreviewField(
                    key='location_metadata',
                    label='Location',
                    value=mapped.location_metadata,
                ),
                StockPreviewField(
                    key='releases',
                    label='Releases',
                    value=list(mapped.releases),
                ),
                StockPreviewField(
                    key='ai_generated_content_disclosure',
                    label='AI Disclosure',
                    value=mapped.ai_generated_content_disclosure,
                ),
                StockPreviewField(
                    key='is_illustration',
                    label='Illustration',
                    value=mapped.is_illustration,
                ),
                StockPreviewField(
                    key='mature_content',
                    label='Mature Content',
                    value=mapped.mature_content,
                ),
            ],
        )

    return StockAwareMetadataPreview(
        stock_platform=stock_platform,
        common_fields=common_fields,
        stock_specific=stock_specific,
        errors=list(validation.errors),
        warnings=list(validation.warnings),
    )
