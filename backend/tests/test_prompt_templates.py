from pathlib import Path

import pytest

from app.core.enums import StockPlatform
from app.services.ai.ai_provider import MockImageMetadataProvider
from app.services.prompt_templates import (
    DEFAULT_PROMPT_LANGUAGE,
    METADATA_PROMPT_TEMPLATE_VERSION,
    render_metadata_generation_prompt,
)


def test_metadata_prompt_template_has_version_and_english_default():
    rendered = render_metadata_generation_prompt(
        shooting_context=None,
        stock_platform=StockPlatform.SHUTTERSTOCK,
    )

    assert rendered.version == METADATA_PROMPT_TEMPLATE_VERSION
    assert rendered.language == DEFAULT_PROMPT_LANGUAGE
    assert rendered.stock_platform == StockPlatform.SHUTTERSTOCK
    assert 'All textual metadata fields must be in English only' in (
        rendered.prompt
    )
    assert 'Do not output any text outside JSON.' in rendered.prompt


def test_metadata_prompt_template_supports_stock_specific_extensions():
    rendered = render_metadata_generation_prompt(
        shooting_context='Outdoor lifestyle shoot',
        stock_platform=StockPlatform.ADOBE_STOCK,
    )

    assert rendered.version == METADATA_PROMPT_TEMPLATE_VERSION
    assert rendered.language == 'en'
    assert rendered.stock_platform == StockPlatform.ADOBE_STOCK
    assert 'Adobe restricted terms list' in rendered.prompt
    assert 'Use this shooting context: Outdoor lifestyle shoot' in (
        rendered.prompt
    )


@pytest.mark.asyncio
async def test_mock_provider_returns_prompt_metadata():
    provider = MockImageMetadataProvider()

    metadata = await provider.generate_metadata(Path('image.jpg'))

    assert metadata.prompt_version == METADATA_PROMPT_TEMPLATE_VERSION
    assert metadata.prompt_language == DEFAULT_PROMPT_LANGUAGE
