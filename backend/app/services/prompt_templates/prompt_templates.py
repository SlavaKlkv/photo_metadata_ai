from dataclasses import dataclass

from app.services.prompt_templates.constants import (
    DEFAULT_PROMPT_LANGUAGE,
    METADATA_PROMPT_TEMPLATE_ID,
    METADATA_PROMPT_TEMPLATE_VERSION,
)


@dataclass(frozen=True)
class PromptTemplateRender:
    prompt: str
    template_id: str
    version: str
    language: str


def render_metadata_generation_prompt(
    *,
    shooting_context: str | None,
    language: str = DEFAULT_PROMPT_LANGUAGE,
) -> PromptTemplateRender:
    effective_language = language or DEFAULT_PROMPT_LANGUAGE

    prompt = (
        'Generate platform-agnostic stock photo metadata for this image. '
        'Return only valid JSON '
        'with fields: '
        'title, description, keywords, categories, '
        'license_type, location_metadata, editorial_date, is_editorial, '
        'editorial_caption, has_people, people_count, '
        'model_release_available, releases, '
        'ai_generated_content_disclosure, is_illustration, '
        'mature_content. '
        'keywords, categories and releases must be arrays of strings. '
        'has_people must be boolean; model_release_available must be boolean '
        'or null. '
        'people_count must be integer or null. '
        'Do not optimize for a specific marketplace or platform. '
        'Do not apply marketplace-specific title limits, keyword limits, '
        'category vocabularies, license enums or restricted-term lists. '
        'Those platform rules are applied later during preview and export. '
        'Use broad, reusable metadata that can be mapped to multiple stock '
        'platforms. '
        'Generate enough source metadata for later stock-specific trimming: '
        'title must contain at least 5 descriptive words; '
        'description must be non-empty and contain at least one complete '
        'factual sentence; '
        'keywords must contain at least 15 unique, relevant keywords ordered '
        'from most important to least important; '
        'each keyword must be a short search tag, not a sentence, and must '
        'not contain comma-separated subkeywords inside one array item; '
        'prefer 1-3 words per keyword; '
        'categories must contain 1-2 broad reusable category candidates; '
        'license_type must be commercial or editorial; '
        'location_metadata must be a concise location string when a real '
        'location is visible or provided, otherwise null; '
        'editorial_date must be an ISO date string only when known and '
        'relevant to editorial content, otherwise null; '
        'Do not infer editorial_date from unrelated context dates; use it '
        'only when the shooting context explicitly labels a date as '
        'editorial_date or when the editorial event date is unambiguous; '
        'editorial_caption must be a complete factual caption for editorial '
        'content, otherwise null; '
        'has_people must reflect whether people are visible; '
        'people_count must be the visible people count or null when unknown; '
        'model_release_available must be true only when a model release is '
        'known to exist, false only when it is known not to exist, otherwise '
        'null; '
        'releases must list known model or property releases and be an empty '
        'array when none are known; '
        'ai_generated_content_disclosure, is_illustration and mature_content '
        'must always be explicit booleans. '
        'Put up to two broad category candidates into categories; '
        'do not output category_2. '
        'Use license_type only as a general content classification '
        '(commercial or editorial), not as a marketplace-specific license. '
        'All textual metadata fields must be in English only '
        '(title, description, keywords, categories, '
        'location_metadata, editorial_caption, releases). '
        'Do not use any other language in these fields. '
        'Do not output any text outside JSON.'
    )

    if shooting_context:
        prompt = f'{prompt} Use this shooting context: {shooting_context}'

    return PromptTemplateRender(
        prompt=prompt,
        template_id=METADATA_PROMPT_TEMPLATE_ID,
        version=METADATA_PROMPT_TEMPLATE_VERSION,
        language=effective_language,
    )
