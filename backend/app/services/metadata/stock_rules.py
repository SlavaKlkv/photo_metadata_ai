from dataclasses import dataclass

from app.core.enums import (
    StockPlatform,
    StockPlatformType,
)
from app.schemas.job import StockFieldOptions


@dataclass(frozen=True)
class StockRules:
    platform_type: StockPlatformType
    title_required: bool
    title_max_characters: int
    title_warning_characters: int | None
    title_min_words: int
    title_recommended_min_words: int | None
    title_recommended_max_words: int | None
    description_required: bool
    description_max_characters: int
    image_min_megapixels: float | None
    image_max_megapixels: float | None
    keywords_required: bool
    keywords_min_count: int
    keywords_recommended_min: int
    keywords_recommended_max: int
    keywords_max_count: int
    keywords_order_priority: bool
    keywords_duplicates_allowed: bool
    top_keywords_weighted: bool
    categories_required: bool
    max_categories: int
    supports_category_2: bool
    license_required: bool
    releases_required: bool
    release_forms_required: bool
    editorial_caption_required: bool
    editorial_date_required: bool
    editorial_location_required: bool
    location_supported: bool
    location_recommended: bool
    iptc_embedded_metadata: bool
    validation_english_required: bool
    validation_keyword_spam_forbidden: bool
    validation_irrelevant_keywords_forbidden: bool
    validation_duplicate_keywords_forbidden: bool
    validation_restricted_terms_forbidden: bool
    validation_accurate_caption_required: bool
    people_supported: bool
    model_release_required_when_people: bool
    license_types: tuple[str, ...]
    categories: tuple[str, ...]


GETTY_CATEGORIES: tuple[str, ...] = (
    'Creative',
    'Editorial',
    'Entertainment',
    'News',
    'Sport',
    'Archival',
    'Lifestyle',
    'Business',
    'Travel',
    'Nature',
    'Food',
    'Healthcare',
    'Technology',
)

SHUTTERSTOCK_CATEGORIES: tuple[str, ...] = (
    'Abstract',
    'Animals/Wildlife',
    'Arts',
    'Backgrounds/Textures',
    'Beauty/Fashion',
    'Buildings/Landmarks',
    'Business/Finance',
    'Education',
    'Food and Drink',
    'Healthcare/Medical',
    'Holidays',
    'Industrial',
    'Nature',
    'Objects',
    'Parks/Outdoor',
    'People',
    'Religion',
    'Science',
    'Sports/Recreation',
    'Technology',
    'Transportation',
    'Vintage',
)

ADOBE_CATEGORIES: tuple[str, ...] = (
    'Animals',
    'Buildings and Architecture',
    'Business',
    'Drinks',
    'The Environment',
    'States of Mind',
    'Food',
    'Graphic Resources',
    'Hobbies and Leisure',
    'Industry',
    'Landscape',
    'Lifestyle',
    'People',
    'Plants and Flowers',
    'Culture and Religion',
    'Science',
    'Social Issues',
    'Sports',
    'Technology',
    'Transport',
    'Travel',
)

STOCK_RULES: dict[StockPlatform, StockRules] = {
    StockPlatform.GETTY_IMAGES: StockRules(
        platform_type=StockPlatformType.PREMIUM_STOCK_AGENCY,
        title_required=True,
        title_max_characters=200,
        title_warning_characters=None,
        title_min_words=5,
        title_recommended_min_words=5,
        title_recommended_max_words=15,
        description_required=True,
        description_max_characters=2000,
        image_min_megapixels=3.0,
        image_max_megapixels=256.0,
        keywords_required=True,
        keywords_min_count=5,
        keywords_recommended_min=10,
        keywords_recommended_max=25,
        keywords_max_count=50,
        keywords_order_priority=True,
        keywords_duplicates_allowed=False,
        top_keywords_weighted=False,
        categories_required=True,
        max_categories=2,
        supports_category_2=True,
        license_required=True,
        releases_required=True,
        release_forms_required=True,
        editorial_caption_required=True,
        editorial_date_required=True,
        editorial_location_required=True,
        location_supported=True,
        location_recommended=True,
        iptc_embedded_metadata=True,
        validation_english_required=True,
        validation_keyword_spam_forbidden=True,
        validation_irrelevant_keywords_forbidden=True,
        validation_duplicate_keywords_forbidden=True,
        validation_restricted_terms_forbidden=False,
        validation_accurate_caption_required=True,
        people_supported=True,
        model_release_required_when_people=True,
        license_types=('creative', 'editorial'),
        categories=GETTY_CATEGORIES,
    ),
    StockPlatform.SHUTTERSTOCK: StockRules(
        platform_type=StockPlatformType.MICROSTOCK,
        title_required=True,
        title_max_characters=2048,
        title_warning_characters=150,
        title_min_words=5,
        title_recommended_min_words=None,
        title_recommended_max_words=None,
        description_required=False,
        description_max_characters=2048,
        image_min_megapixels=None,
        image_max_megapixels=None,
        keywords_required=True,
        keywords_min_count=7,
        keywords_recommended_min=15,
        keywords_recommended_max=30,
        keywords_max_count=50,
        keywords_order_priority=True,
        keywords_duplicates_allowed=False,
        top_keywords_weighted=False,
        categories_required=True,
        max_categories=2,
        supports_category_2=True,
        license_required=False,
        releases_required=False,
        release_forms_required=True,
        editorial_caption_required=True,
        editorial_date_required=False,
        editorial_location_required=False,
        location_supported=True,
        location_recommended=False,
        iptc_embedded_metadata=True,
        validation_english_required=True,
        validation_keyword_spam_forbidden=True,
        validation_irrelevant_keywords_forbidden=True,
        validation_duplicate_keywords_forbidden=True,
        validation_restricted_terms_forbidden=False,
        validation_accurate_caption_required=False,
        people_supported=True,
        model_release_required_when_people=True,
        license_types=('commercial', 'editorial'),
        categories=SHUTTERSTOCK_CATEGORIES,
    ),
    StockPlatform.ADOBE_STOCK: StockRules(
        platform_type=StockPlatformType.MICROSTOCK,
        title_required=True,
        title_max_characters=70,
        title_warning_characters=None,
        title_min_words=1,
        title_recommended_min_words=5,
        title_recommended_max_words=10,
        description_required=False,
        description_max_characters=2000,
        image_min_megapixels=None,
        image_max_megapixels=None,
        keywords_required=True,
        keywords_min_count=5,
        keywords_recommended_min=15,
        keywords_recommended_max=35,
        keywords_max_count=49,
        keywords_order_priority=True,
        keywords_duplicates_allowed=False,
        top_keywords_weighted=True,
        categories_required=True,
        max_categories=1,
        supports_category_2=False,
        license_required=False,
        releases_required=True,
        release_forms_required=True,
        editorial_caption_required=True,
        editorial_date_required=False,
        editorial_location_required=False,
        location_supported=True,
        location_recommended=True,
        iptc_embedded_metadata=True,
        validation_english_required=True,
        validation_keyword_spam_forbidden=True,
        validation_irrelevant_keywords_forbidden=True,
        validation_duplicate_keywords_forbidden=True,
        validation_restricted_terms_forbidden=True,
        validation_accurate_caption_required=False,
        people_supported=True,
        model_release_required_when_people=True,
        license_types=('standard', 'extended', 'editorial'),
        categories=ADOBE_CATEGORIES,
    ),
}


def get_stock_rules(stock_platform: StockPlatform) -> StockRules:
    return STOCK_RULES[stock_platform]


def get_stock_field_options(
    stock_platform: StockPlatform,
) -> StockFieldOptions:
    """
    Возвращает справочники и правила метаданных для выбранного стока.
    """
    rules = get_stock_rules(stock_platform)
    return StockFieldOptions(
        stock_platform=stock_platform,
        platform_type=rules.platform_type,
        categories=list(rules.categories),
        license_types=list(rules.license_types),
        title_required=rules.title_required,
        title_min_words=rules.title_min_words,
        title_recommended_min_words=rules.title_recommended_min_words,
        title_recommended_max_words=rules.title_recommended_max_words,
        title_max_characters=rules.title_max_characters,
        title_warning_characters=rules.title_warning_characters,
        description_required=rules.description_required,
        description_max_characters=rules.description_max_characters,
        image_min_megapixels=rules.image_min_megapixels,
        image_max_megapixels=rules.image_max_megapixels,
        keywords_required=rules.keywords_required,
        keywords_min_count=rules.keywords_min_count,
        keywords_recommended_min=rules.keywords_recommended_min,
        keywords_recommended_max=rules.keywords_recommended_max,
        keywords_max_count=rules.keywords_max_count,
        keywords_order_priority=rules.keywords_order_priority,
        keywords_duplicates_allowed=rules.keywords_duplicates_allowed,
        top_keywords_weighted=rules.top_keywords_weighted,
        categories_required=rules.categories_required,
        multi_category_supported=rules.supports_category_2,
        max_categories=rules.max_categories,
        location_supported=rules.location_supported,
        location_recommended=rules.location_recommended,
        iptc_embedded_metadata=rules.iptc_embedded_metadata,
        release_forms_required=rules.release_forms_required,
        editorial_caption_required_for_editorial=(
            rules.editorial_caption_required
        ),
        validation_english_required=rules.validation_english_required,
        validation_keyword_spam_forbidden=(
            rules.validation_keyword_spam_forbidden
        ),
        validation_irrelevant_keywords_forbidden=(
            rules.validation_irrelevant_keywords_forbidden
        ),
        validation_duplicate_keywords_forbidden=(
            rules.validation_duplicate_keywords_forbidden
        ),
        validation_restricted_terms_forbidden=(
            rules.validation_restricted_terms_forbidden
        ),
        validation_accurate_caption_required=(
            rules.validation_accurate_caption_required
        ),
        supports_category_2=rules.supports_category_2,
        license_required=rules.license_required,
        releases_required=rules.releases_required,
        editorial_caption_required=rules.editorial_caption_required,
        editorial_date_required=rules.editorial_date_required,
        editorial_location_required=rules.editorial_location_required,
        people_supported=rules.people_supported,
        model_release_required_when_people=(
            rules.model_release_required_when_people
        ),
    )
