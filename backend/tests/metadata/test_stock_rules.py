import pytest

from app.core.enums import StockPlatform
from app.services.metadata.stock_rules import (
    STOCK_RULES,
    get_stock_field_options,
    get_stock_rules,
)


@pytest.mark.parametrize('platform', list(StockPlatform))
def test_get_stock_rules_returns_rules_for_every_platform(platform):
    assert get_stock_rules(platform) is STOCK_RULES[platform]


@pytest.mark.parametrize('platform', list(StockPlatform))
def test_get_stock_field_options_matches_rules(platform):
    rules = get_stock_rules(platform)
    options = get_stock_field_options(platform)

    assert options.stock_platform == platform
    assert options.platform_type == rules.platform_type
    assert options.categories == list(rules.categories)
    assert options.license_types == list(rules.license_types)
    assert options.title_required == rules.title_required
    assert options.title_max_characters == rules.title_max_characters
    assert options.description_max_characters == (
        rules.description_max_characters
    )
    assert options.keywords_max_count == rules.keywords_max_count
    assert options.max_categories == rules.max_categories
    assert options.multi_category_supported == rules.supports_category_2
    assert options.supports_category_2 == rules.supports_category_2
    assert options.editorial_caption_required_for_editorial == (
        rules.editorial_caption_required
    )
    assert options.model_release_required_when_people == (
        rules.model_release_required_when_people
    )


@pytest.mark.parametrize('platform', list(StockPlatform))
def test_get_stock_field_options_returns_fresh_lists(platform):
    first = get_stock_field_options(platform)
    second = get_stock_field_options(platform)

    first.categories.append('mutated')

    assert 'mutated' not in second.categories
    assert 'mutated' not in get_stock_field_options(platform).categories
