import json
from dataclasses import dataclass
from typing import Callable

from app.core.enums import StockPlatform
from app.services.metadata.stock_metadata import get_stock_field_options
from app.services.metadata.stock_validation_lists import (
    load_adobe_restricted_terms,
)

DEFAULT_PROMPT_LANGUAGE = 'en'
METADATA_PROMPT_TEMPLATE_ID = 'stock_metadata'
METADATA_PROMPT_TEMPLATE_VERSION = 'stock_metadata.v1'


@dataclass(frozen=True)
class PromptTemplateRender:
    prompt: str
    template_id: str
    version: str
    language: str
    stock_platform: StockPlatform


PromptExtensionRenderer = Callable[[str], str]


def render_metadata_generation_prompt(
    *,
    shooting_context: str | None,
    stock_platform: StockPlatform | None,
    language: str = DEFAULT_PROMPT_LANGUAGE,
) -> PromptTemplateRender:
    effective_stock_platform = stock_platform or StockPlatform.SHUTTERSTOCK
    effective_language = language or DEFAULT_PROMPT_LANGUAGE
    stock_options = get_stock_field_options(effective_stock_platform)
    stock_rules_json = json.dumps(
        stock_options.model_dump(mode='json'),
        ensure_ascii=False,
        separators=(',', ':'),
    )

    prompt = (
        'Generate stock photo metadata for this image. '
        'Return only valid JSON '
        'with fields: '
        'title, description, keywords, categories, category_2, '
        'license_type, location_metadata, editorial_date, is_editorial, '
        'editorial_caption, has_people, people_count, '
        'model_release_available, releases, '
        'ai_generated_content_disclosure, is_illustration, '
        'mature_content. '
        'keywords, categories and releases must be arrays of strings. '
        'has_people and model_release_available must be boolean. '
        'people_count must be integer or null. '
        'Apply all platform rules, limits, required flags and constraints '
        'from this stock rules JSON exactly: '
        f'{stock_rules_json}. '
        'Use rules fields directly: '
        'title/description/keywords/categories/license/editorial/location/'
        'release/people constraints must comply with provided limits and '
        'required flags. '
        'categories must use only values from rules.categories with max '
        'rules.max_categories; category_2 must follow '
        'rules.supports_category_2; license_type must use only '
        'rules.license_types and respect rules.license_required. '
        'keywords must respect required/min/recommended/max and duplicate '
        'rules. '
        'If a field is not supported by rules, return null, false or [] as '
        'appropriate and keep output consistent. '
        'All textual metadata fields must be in English only '
        '(title, description, keywords, categories, category_2, '
        'location_metadata, editorial_caption, releases). '
        'Do not use any other language in these fields. '
        'Do not output any text outside JSON.'
    )

    extension_renderer = _STOCK_PROMPT_EXTENSIONS.get(effective_stock_platform)
    if extension_renderer is not None:
        prompt = extension_renderer(prompt)

    if shooting_context:
        prompt = f'{prompt} Use this shooting context: {shooting_context}'

    return PromptTemplateRender(
        prompt=prompt,
        template_id=METADATA_PROMPT_TEMPLATE_ID,
        version=METADATA_PROMPT_TEMPLATE_VERSION,
        language=effective_language,
        stock_platform=effective_stock_platform,
    )


def _render_adobe_stock_extension(prompt: str) -> str:
    adobe_restricted_terms = load_adobe_restricted_terms()
    restricted_terms_csv = ', '.join(adobe_restricted_terms.all_terms)

    return (
        f'{prompt} '
        f'Adobe restricted terms list ({adobe_restricted_terms.version}): '
        f'{restricted_terms_csv}. '
        'Do not use these terms in title, description, keywords, '
        'categories, location_metadata or editorial_caption.'
    )


_STOCK_PROMPT_EXTENSIONS: dict[
    StockPlatform,
    PromptExtensionRenderer,
] = {
    StockPlatform.ADOBE_STOCK: _render_adobe_stock_extension,
}
