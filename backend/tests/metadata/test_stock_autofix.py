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


def test_stock_autofix_extends_title_short_after_shutterstock_mapping():
    # Сырой title формально набирает 5 слов, но после обрезки мэппинга по
    # символам (150 для Shutterstock) отображаемый заголовок теряет слова и
    # опускается ниже title_min_words. Раньше автофикс смотрел на сырой title
    # и не применял правку — заголовок «залипал» коротким.
    long_word = 'a' * 30
    raw_title = ' '.join(long_word for _ in range(5))

    assert len(raw_title.split()) >= 5

    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title=raw_title,
        keywords=['sunset', 'ocean', 'travel', 'nature', 'scenic'],
        categories=['Nature'],
        has_people=False,
        field_sources={'title': MetadataFieldSource.GENERATED},
    )

    # Предусловие бага: до автофикса mapped-заголовок короче минимума.
    before = validate_file_metadata_for_stock(file, StockPlatform.SHUTTERSTOCK)
    assert ('title', 'min_words_not_met') in {
        (error.field, error.code) for error in before.errors
    }

    apply_stock_metadata_autofixes(file, StockPlatform.SHUTTERSTOCK)

    validation = validate_file_metadata_for_stock(
        file,
        StockPlatform.SHUTTERSTOCK,
    )
    assert ('title', 'min_words_not_met') not in {
        (error.field, error.code) for error in validation.errors
    }

    # Идемпотентность: повторный прогон ничего не меняет.
    fixed_title = file.title
    apply_stock_metadata_autofixes(file, StockPlatform.SHUTTERSTOCK)
    assert file.title == fixed_title


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
