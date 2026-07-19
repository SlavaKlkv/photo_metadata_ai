from app.schemas.job import ProcessingJobFile
from app.services.ai.ai_provider import (
    _build_metadata_response,
    _extract_location_components,
)
from app.services.metadata.metadata_embedding import resolve_iptc_location
from app.services.prompt_templates.prompt_templates import (
    PromptTemplateRender,
)


def _render() -> PromptTemplateRender:
    return PromptTemplateRender(
        prompt='prompt',
        template_id='id',
        version='v1',
        language='en',
    )


def _file(**kwargs) -> ProcessingJobFile:
    return ProcessingJobFile(
        filename='photo.jpg',
        original_filename='photo.jpg',
        **kwargs,
    )


def test_structured_location_maps_each_component_to_correct_field():
    file = _file(
        location_metadata='Edinburgh, Scotland, United Kingdom',
        location_city='Edinburgh',
        location_province_state='Scotland',
        location_country='United Kingdom',
    )

    location = resolve_iptc_location(file)

    assert location.city == 'Edinburgh'
    assert location.province_state == 'Scotland'
    assert location.country_name == 'United Kingdom'


def test_structured_country_only_does_not_leak_into_city():
    file = _file(
        location_metadata='Switzerland',
        location_country='Switzerland',
    )

    location = resolve_iptc_location(file)

    assert location.city is None
    assert location.province_state is None
    assert location.country_name == 'Switzerland'


def test_missing_structured_fields_fall_back_to_string_split():
    file = _file(location_metadata='Paris, France')

    location = resolve_iptc_location(file)

    assert location.city == 'Paris'
    assert location.country_name == 'France'


def test_extract_location_components_reads_nested_object():
    components = _extract_location_components(
        {
            'location': {
                'sublocation': 'Old Town',
                'city': 'Edinburgh',
                'state': 'Scotland',
                'country': 'United Kingdom',
            }
        }
    )

    assert components == (
        'Old Town',
        'Edinburgh',
        'Scotland',
        'United Kingdom',
    )


def test_extract_location_components_without_object_returns_none():
    assert _extract_location_components({}) == (None, None, None, None)


def test_build_response_composes_display_string_from_components():
    response = _build_metadata_response(
        metadata={
            'title': 'A title with five words here',
            'description': 'Sentence.',
            'location': {
                'city': 'Edinburgh',
                'province_state': 'Scotland',
                'country': 'United Kingdom',
            },
        },
        prompt_render=_render(),
    )

    assert response.location_city == 'Edinburgh'
    assert response.location_province_state == 'Scotland'
    assert response.location_country == 'United Kingdom'
    assert response.location_metadata == 'Edinburgh, Scotland, United Kingdom'


def test_build_response_prefers_explicit_display_string():
    response = _build_metadata_response(
        metadata={
            'title': 'A title with five words here',
            'description': 'Sentence.',
            'location_metadata': 'Downtown Edinburgh',
            'location': {'city': 'Edinburgh', 'country': 'United Kingdom'},
        },
        prompt_render=_render(),
    )

    assert response.location_metadata == 'Downtown Edinburgh'
    assert response.location_city == 'Edinburgh'
    assert response.location_country == 'United Kingdom'
