from app.core.enums import StockPlatform
from app.schemas.job import StockFieldOptions
from app.services.metadata.stock_rules_data import (
    ADOBE_CATEGORIES,
    GETTY_CATEGORIES,
    SHUTTERSTOCK_CATEGORIES,
    STOCK_RULES,
    StockRules,
)

__all__ = [
    'ADOBE_CATEGORIES',
    'GETTY_CATEGORIES',
    'SHUTTERSTOCK_CATEGORIES',
    'STOCK_RULES',
    'StockRules',
    'get_stock_field_options',
    'get_stock_rules',
]


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
