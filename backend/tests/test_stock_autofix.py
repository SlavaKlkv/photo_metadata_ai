from app.core.enums import MetadataFieldSource, StockPlatform
from app.schemas.job import ProcessingJobFile
from app.services.metadata.stock_autofix import apply_stock_metadata_autofixes
from app.services.metadata.stock_validation import (
    validate_file_metadata_for_stock,
)


def test_stock_autofix_extends_generated_short_title():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title='Sky',
        description='Pastel gradient sky background for abstract design',
        keywords=['pastel', 'gradient', 'abstract', 'background', 'design'],
        categories=['Creative'],
        license_type='commercial',
        has_people=False,
        field_sources={'title': MetadataFieldSource.GENERATED},
    )

    apply_stock_metadata_autofixes(file, StockPlatform.GETTY_IMAGES)

    assert len((file.title or '').split()) >= 5
    validation = validate_file_metadata_for_stock(
        file,
        StockPlatform.GETTY_IMAGES,
    )
    assert not [
        error
        for error in validation.errors
        if error.field == 'title' and error.code == 'min_words_not_met'
    ]


def test_stock_autofix_keeps_edited_short_title():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title='Sky',
        description='Pastel gradient sky background for abstract design',
        keywords=['pastel', 'gradient', 'abstract', 'background', 'design'],
        categories=['Creative'],
        license_type='commercial',
        has_people=False,
        field_sources={'title': MetadataFieldSource.EDITED},
    )

    apply_stock_metadata_autofixes(file, StockPlatform.GETTY_IMAGES)

    assert file.title == 'Sky'


def test_stock_autofix_fixes_generated_required_text_and_keywords():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title=None,
        description=None,
        keywords=[],
        categories=['Creative'],
        license_type='commercial',
        has_people=False,
    )

    apply_stock_metadata_autofixes(file, StockPlatform.GETTY_IMAGES)

    validation = validate_file_metadata_for_stock(
        file,
        StockPlatform.GETTY_IMAGES,
    )
    blocking_fields = {
        (error.field, error.code) for error in validation.errors
    }
    assert ('title', 'required') not in blocking_fields
    assert ('title', 'min_words_not_met') not in blocking_fields
    assert ('description', 'required') not in blocking_fields
    assert ('keywords', 'min_items_not_met') not in blocking_fields


def test_stock_autofix_keeps_edited_keywords_short():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title='Pastel gradient sky background image',
        description='Pastel gradient sky background for abstract design',
        keywords=['pastel'],
        categories=['Creative'],
        license_type='commercial',
        has_people=False,
        field_sources={'keywords': MetadataFieldSource.EDITED},
    )

    apply_stock_metadata_autofixes(file, StockPlatform.GETTY_IMAGES)

    assert file.keywords == ['pastel']


def test_stock_autofix_does_not_change_generated_editorial_metadata():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title='Public city event documentary photo',
        description='People gather during a public city event.',
        keywords=['people', 'city', 'event', 'documentary', 'public'],
        categories=['Editorial'],
        license_type='editorial',
        is_editorial=True,
        has_people=True,
        field_sources={
            'is_editorial': MetadataFieldSource.GENERATED,
            'license_type': MetadataFieldSource.GENERATED,
        },
    )

    apply_stock_metadata_autofixes(file, StockPlatform.GETTY_IMAGES)

    assert file.is_editorial is True
    assert file.license_type == 'editorial'
