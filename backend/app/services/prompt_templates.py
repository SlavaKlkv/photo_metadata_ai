from dataclasses import dataclass

DEFAULT_PROMPT_LANGUAGE = 'en'
METADATA_PROMPT_TEMPLATE_ID = 'stock_metadata'
METADATA_PROMPT_TEMPLATE_VERSION = 'stock_metadata.v1'


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
        'title, description, keywords, categories, category_2, '
        'license_type, location_metadata, editorial_date, is_editorial, '
        'editorial_caption, has_people, people_count, '
        'model_release_available, releases, '
        'ai_generated_content_disclosure, is_illustration, '
        'mature_content. '
        'keywords, categories and releases must be arrays of strings. '
        'has_people and model_release_available must be boolean. '
        'people_count must be integer or null. '
        'Do not optimize for a specific marketplace or platform. '
        'Do not apply marketplace-specific title limits, keyword limits, '
        'category vocabularies, license enums or restricted-term lists. '
        'Those platform rules are applied later during preview and export. '
        'Use broad, reusable metadata that can be mapped to multiple stock '
        'platforms. '
        'Use category_2 only when a second broad category is clearly useful; '
        'otherwise return null. '
        'Use license_type only as a general content classification '
        '(commercial or editorial), not as a marketplace-specific license. '
        'All textual metadata fields must be in English only '
        '(title, description, keywords, categories, category_2, '
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
