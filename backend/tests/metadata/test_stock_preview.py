from app.core.enums import StockPlatform
from app.schemas.job import ProcessingJobFile
from app.services.metadata.stock_preview import build_stock_aware_preview


def test_two_category_stocks_show_separate_category_fields():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title='City travel stock photo image',
        description='City travel stock photo metadata.',
        keywords=['city', 'travel', 'photo', 'metadata', 'stock'],
        categories=['Travel'],
        category_2='Nature',
    )

    preview = build_stock_aware_preview(file, StockPlatform.GETTY_IMAGES)
    fields = {field.label: field for field in preview.stock_specific.fields}

    assert fields['Category 1'].key == 'categories'
    assert fields['Category 1'].value == 'Travel'
    assert fields['Category 2'].key == 'category_2'
    assert fields['Category 2'].value == 'Nature'


def test_single_category_stocks_use_categories_key():
    file = ProcessingJobFile(
        filename='image.jpg',
        original_filename='image.jpg',
        title='City travel stock photo image',
        description='City travel stock photo metadata.',
        keywords=['city', 'travel', 'photo', 'metadata', 'stock'],
        categories=['Travel'],
        category_2='Nature',
    )

    preview = build_stock_aware_preview(file, StockPlatform.ADOBE_STOCK)
    fields = {field.label: field for field in preview.stock_specific.fields}

    assert fields['Category'].key == 'categories'
    assert fields['Category'].value == 'Travel'
