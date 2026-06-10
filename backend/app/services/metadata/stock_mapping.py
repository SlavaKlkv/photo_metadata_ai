import re
from dataclasses import dataclass

from app.core.enums import MetadataFieldSource, StockPlatform
from app.schemas.job import ProcessingJobFile
from app.services.metadata.metadata_embedding import IPTCEmbeddingPayload
from app.services.metadata.stock_mapping_data import (
    CATEGORY_ALIASES,
    DEFAULT_STOCK_CATEGORIES,
    LICENSE_ALIASES,
)
from app.services.metadata.stock_rules import get_stock_rules
from app.services.metadata.stock_rules_data import StockRules
from app.services.metadata.stock_validation_lists import (
    find_restricted_terms_in_text,
)


@dataclass(frozen=True)
class StockMappedMetadata:
    """
    Stock-aware представление универсальных metadata для preview/export.
    """

    title: str | None
    description: str | None
    keywords: list[str]
    categories: list[str]
    category_2: str | None
    license_type: str | None
    location_metadata: str | None
    editorial_date: str | None
    is_editorial: bool
    editorial_caption: str | None
    has_people: bool | None
    people_count: int | None
    model_release_available: bool | None
    releases: list[str]
    ai_generated_content_disclosure: bool
    is_illustration: bool | None
    mature_content: bool | None
    iptc_embedded_metadata: bool


def get_effective_categories(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> list[str]:
    """
    Возвращает категории файла в формате выбранного стока.
    """
    rules = get_stock_rules(stock_platform)
    categories = map_stock_categories(file, stock_platform, rules)

    return categories[: rules.max_categories]


def build_stock_mapped_metadata(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> StockMappedMetadata:
    """
    Преобразует универсальные metadata в представление выбранного стока.
    """
    rules = get_stock_rules(stock_platform)
    mapped_title = map_stock_title(file, rules)
    mapped_description = map_stock_description(
        file,
        rules,
        mapped_title,
    )
    mapped_keywords = map_stock_keywords(file, rules)
    mapped_categories = get_effective_categories(file, stock_platform)
    mapped_category_2 = (
        mapped_categories[1]
        if rules.supports_category_2 and len(mapped_categories) > 1
        else None
    )
    mapped_is_editorial = map_stock_is_editorial(file)

    return StockMappedMetadata(
        title=mapped_title,
        description=mapped_description,
        keywords=mapped_keywords,
        categories=mapped_categories,
        category_2=mapped_category_2,
        license_type=map_stock_license_type(
            file,
            stock_platform,
            rules,
            mapped_is_editorial,
        ),
        location_metadata=(
            file.location_metadata if rules.location_supported else None
        ),
        editorial_date=file.editorial_date,
        is_editorial=mapped_is_editorial,
        editorial_caption=map_stock_editorial_caption(
            file,
            rules,
            mapped_title,
            mapped_description,
            mapped_is_editorial,
        ),
        has_people=file.has_people,
        people_count=file.people_count,
        model_release_available=map_stock_model_release_available(file),
        releases=list(file.releases),
        ai_generated_content_disclosure=file.ai_generated_content_disclosure,
        is_illustration=file.is_illustration,
        mature_content=file.mature_content,
        iptc_embedded_metadata=rules.iptc_embedded_metadata,
    )


def build_stock_iptc_payload(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> IPTCEmbeddingPayload:
    mapped_metadata = build_stock_mapped_metadata(file, stock_platform)
    caption = mapped_metadata.description or ''

    if mapped_metadata.is_editorial and mapped_metadata.editorial_caption:
        caption = mapped_metadata.editorial_caption

    return IPTCEmbeddingPayload(
        object_name=mapped_metadata.title or '',
        caption_abstract=caption,
        keywords=list(mapped_metadata.keywords),
        supplemental_category=list(mapped_metadata.categories),
        city=mapped_metadata.location_metadata,
        date_created=(
            mapped_metadata.editorial_date
            if mapped_metadata.is_editorial
            else None
        ),
        special_instructions=_build_stock_iptc_special_instructions(
            mapped_metadata,
            stock_platform,
        ),
    )


def map_stock_title(
    file: ProcessingJobFile,
    rules: StockRules,
) -> str | None:
    title = file.title or file.description
    max_characters = _get_stock_title_characters_limit(rules)
    trimmed_title = _trim_metadata_text(title, max_characters)

    if trimmed_title is None:
        return None

    return _trim_title_words(trimmed_title, rules)


def map_stock_description(
    file: ProcessingJobFile,
    rules: StockRules,
    mapped_title: str | None,
) -> str | None:
    description = file.description

    if not description and rules.description_required:
        description = mapped_title or file.title

    return _trim_metadata_text(description, rules.description_max_characters)


def map_stock_keywords(
    file: ProcessingJobFile,
    rules: StockRules,
) -> list[str]:
    keywords: list[str] = []
    seen_keywords: set[str] = set()
    keywords_limit = _get_stock_keywords_limit(rules)
    keywords_target_min = min(
        rules.keywords_recommended_min,
        keywords_limit,
    )

    for keyword in file.keywords:
        normalized_keyword = _normalize_keyword_candidate(str(keyword))
        dedupe_key = normalized_keyword.lower()

        if not normalized_keyword or dedupe_key in seen_keywords:
            continue

        if (
            rules.validation_restricted_terms_forbidden
            and find_restricted_terms_in_text(normalized_keyword)
        ):
            continue

        keywords.append(normalized_keyword)
        seen_keywords.add(dedupe_key)

        if len(keywords) >= keywords_limit:
            break

    if (
        len(keywords) < keywords_target_min
        and file.field_sources.get('keywords') != MetadataFieldSource.EDITED
    ):
        for keyword in _iter_keyword_candidates(file):
            normalized_keyword = _normalize_keyword_candidate(keyword)
            dedupe_key = normalized_keyword.lower()

            if not normalized_keyword or dedupe_key in seen_keywords:
                continue

            if (
                rules.validation_restricted_terms_forbidden
                and find_restricted_terms_in_text(normalized_keyword)
            ):
                continue

            keywords.append(normalized_keyword)
            seen_keywords.add(dedupe_key)

            if (
                len(keywords) >= keywords_target_min
                or len(keywords) >= keywords_limit
            ):
                break

    return keywords


def map_stock_editorial_caption(
    file: ProcessingJobFile,
    rules: StockRules,
    mapped_title: str | None,
    mapped_description: str | None,
    is_editorial: bool,
) -> str | None:
    editorial_caption = file.editorial_caption

    if (
        not editorial_caption
        and is_editorial
        and rules.editorial_caption_required
    ):
        editorial_caption = mapped_description or mapped_title

    return _trim_metadata_text(
        editorial_caption,
        rules.description_max_characters,
    )


def map_stock_model_release_available(
    file: ProcessingJobFile,
) -> bool | None:
    if file.model_release_available is not None:
        return file.model_release_available

    if file.has_people is False:
        return False

    return None


def map_stock_categories(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
    rules: StockRules,
) -> list[str]:
    mapped_categories: list[str] = []
    raw_categories = list(file.categories)

    if file.category_2:
        raw_categories.append(file.category_2)

    for category in raw_categories:
        mapped_category = _map_single_stock_category(
            category,
            stock_platform,
            rules,
        )

        if not mapped_category or mapped_category in mapped_categories:
            continue

        mapped_categories.append(mapped_category)

        if len(mapped_categories) >= rules.max_categories:
            return mapped_categories

    if not mapped_categories:
        inferred_category = _infer_stock_category(file, stock_platform)
        if inferred_category:
            mapped_categories.append(inferred_category)

    if not mapped_categories and rules.categories_required:
        mapped_categories.append(DEFAULT_STOCK_CATEGORIES[stock_platform])

    return mapped_categories[: rules.max_categories]


def map_stock_license_type(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
    rules: StockRules,
    is_editorial: bool,
) -> str | None:
    normalized_license = _normalize_stock_value(file.license_type or '')

    if is_editorial and 'editorial' in rules.license_types:
        return 'editorial'

    if not normalized_license:
        return _get_default_license_type(
            stock_platform,
            rules,
            is_editorial,
            has_source_license=False,
        )

    license_types_by_key = {
        _normalize_stock_value(license_type): license_type
        for license_type in rules.license_types
    }
    direct_license_type = license_types_by_key.get(normalized_license)

    if direct_license_type:
        return direct_license_type

    alias_license_type = LICENSE_ALIASES.get(normalized_license, {}).get(
        stock_platform
    )

    if alias_license_type:
        return alias_license_type

    return _get_default_license_type(
        stock_platform,
        rules,
        is_editorial,
        has_source_license=True,
    )


def map_stock_is_editorial(file: ProcessingJobFile) -> bool:
    if file.is_editorial:
        return True

    return _normalize_stock_value(file.license_type or '') == 'editorial'


def _map_single_stock_category(
    category: str,
    stock_platform: StockPlatform,
    rules: StockRules,
) -> str | None:
    normalized_category = _normalize_stock_value(category)

    if not normalized_category:
        return None

    categories_by_key = {
        _normalize_stock_value(stock_category): stock_category
        for stock_category in rules.categories
    }
    direct_category = categories_by_key.get(normalized_category)

    if direct_category:
        return direct_category

    return _match_category_alias(normalized_category, stock_platform)


def _infer_stock_category(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> str | None:
    if file.has_people:
        return CATEGORY_ALIASES['people'][stock_platform]

    search_text = _normalize_stock_value(
        ' '.join(
            [
                file.title or '',
                file.description or '',
                ' '.join(file.keywords),
            ]
        )
    )

    return _match_category_alias(search_text, stock_platform)


def _match_category_alias(
    normalized_value: str,
    stock_platform: StockPlatform,
) -> str | None:
    value_tokens = set(normalized_value.split())

    for alias, platform_categories in CATEGORY_ALIASES.items():
        normalized_alias = _normalize_stock_value(alias)
        alias_tokens = set(normalized_alias.split())

        if (
            normalized_value == normalized_alias
            or alias_tokens <= value_tokens
        ):
            return platform_categories[stock_platform]

    return None


def _get_default_license_type(
    stock_platform: StockPlatform,
    rules: StockRules,
    is_editorial: bool,
    *,
    has_source_license: bool,
) -> str | None:
    if is_editorial and 'editorial' in rules.license_types:
        return 'editorial'

    if stock_platform == StockPlatform.GETTY_IMAGES:
        return 'creative'

    if not has_source_license and not rules.license_required:
        return None

    for license_type in rules.license_types:
        if license_type != 'editorial':
            return license_type

    return rules.license_types[0] if rules.license_types else None


def _get_stock_keywords_limit(rules: StockRules) -> int:
    if rules.keywords_recommended_max <= 0:
        return rules.keywords_max_count

    return min(rules.keywords_max_count, rules.keywords_recommended_max)


def _get_stock_title_characters_limit(rules: StockRules) -> int:
    if rules.title_warning_characters is None:
        return rules.title_max_characters

    return min(rules.title_max_characters, rules.title_warning_characters)


def _trim_title_words(
    title: str,
    rules: StockRules,
) -> str:
    max_words = rules.title_recommended_max_words
    words = title.split()

    if max_words is not None and len(words) > max_words:
        return ' '.join(words[:max_words])

    return ' '.join(words)


def _iter_keyword_candidates(
    file: ProcessingJobFile,
) -> list[str]:
    keyword_candidates = [
        *file.categories,
        *([file.category_2] if file.category_2 else []),
    ]
    word_candidates = [
        word
        for value in [file.title, file.description]
        if value
        for word in _split_metadata_words(value)
    ]

    return [*keyword_candidates, *word_candidates]


def _split_metadata_words(value: str) -> list[str]:
    return [word for word in re.findall(r"[A-Za-z][A-Za-z'-]{2,}", value)]


def _normalize_keyword_candidate(value: str) -> str:
    normalized_keyword = ' '.join(value.strip().split())
    normalized_keyword = normalized_keyword.strip('.,;:-')

    if len(normalized_keyword) < 3:
        return ''

    return normalized_keyword


def _trim_metadata_text(
    value: str | None,
    max_characters: int,
) -> str | None:
    if value is None:
        return None

    normalized_value = ' '.join(value.strip().split())

    if not normalized_value:
        return None

    if len(normalized_value) <= max_characters:
        return normalized_value

    trimmed_value = normalized_value[:max_characters].rstrip()
    word_trimmed_value = trimmed_value.rsplit(' ', 1)[0].rstrip('.,;:-')

    return word_trimmed_value or trimmed_value


def _normalize_stock_value(value: str) -> str:
    normalized_value = value.lower().replace('_', ' ')
    normalized_value = re.sub(r'[^a-z0-9]+', ' ', normalized_value)
    return ' '.join(normalized_value.split())


def _build_stock_iptc_special_instructions(
    mapped_metadata: StockMappedMetadata,
    stock_platform: StockPlatform,
) -> str | None:
    parts: list[str] = []

    if mapped_metadata.license_type:
        parts.append(f'license={mapped_metadata.license_type}')

    if mapped_metadata.releases:
        parts.append(f'releases={", ".join(mapped_metadata.releases)}')
    elif mapped_metadata.model_release_available is not None:
        release_value = (
            'yes' if mapped_metadata.model_release_available else 'no'
        )
        parts.append(f'model_release={release_value}')

    if stock_platform == StockPlatform.SHUTTERSTOCK:
        if mapped_metadata.is_illustration is not None:
            illustration_value = (
                'yes' if mapped_metadata.is_illustration else 'no'
            )
            parts.append(f'illustration={illustration_value}')
        if mapped_metadata.mature_content is not None:
            mature_value = 'yes' if mapped_metadata.mature_content else 'no'
            parts.append(f'mature_content={mature_value}')

    if stock_platform == StockPlatform.GETTY_IMAGES:
        if mapped_metadata.is_editorial:
            parts.append('editorial=yes')
        if mapped_metadata.editorial_date:
            parts.append(f'editorial_date={mapped_metadata.editorial_date}')
        if mapped_metadata.location_metadata:
            parts.append(f'location={mapped_metadata.location_metadata}')

    if stock_platform == StockPlatform.ADOBE_STOCK:
        if mapped_metadata.ai_generated_content_disclosure:
            parts.append('ai_generated=yes')
        if mapped_metadata.is_illustration is not None:
            illustration_value = (
                'yes' if mapped_metadata.is_illustration else 'no'
            )
            parts.append(f'illustration={illustration_value}')
        if mapped_metadata.mature_content is not None:
            mature_value = 'yes' if mapped_metadata.mature_content else 'no'
            parts.append(f'mature_content={mature_value}')

    if not parts:
        return None

    return '; '.join(parts)
