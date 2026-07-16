from pathlib import Path

import pytest

from app.core.enums import AIProvider
from app.core.exceptions import AIProviderConfigurationError
from app.services.ai.ai_fallback import (
    build_provider_fallback_chain,
    generate_metadata_with_fallback,
    validate_primary_provider_configuration,
)
from app.services.ai.ai_provider import (
    AIMetadataResponse,
    BaseAIProvider,
)


class _RuntimeFailingProvider(BaseAIProvider):
    async def generate_metadata(self, *args, **kwargs):
        raise RuntimeError('provider temporarily unavailable')


class _SuccessfulProvider(BaseAIProvider):
    async def generate_metadata(self, *args, **kwargs):
        return AIMetadataResponse(
            title='Fallback title',
            description='Fallback description',
            keywords=['fallback', 'metadata'],
        )


def test_provider_fallback_order_starts_from_selected_provider():
    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OLLAMA)
    ] == [
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ]
    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]
    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OPENROUTER)
    ] == [
        AIProvider.OPENROUTER,
        AIProvider.GEMINI,
        AIProvider.OLLAMA,
    ]


@pytest.mark.asyncio
async def test_runtime_error_falls_back_to_next_provider():
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.OLLAMA:
            return _RuntimeFailingProvider(model=model)
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.GEMINI
    assert result.metadata.title == 'Fallback title'
    assert attempts == [AIProvider.OLLAMA, AIProvider.GEMINI]


@pytest.mark.asyncio
async def test_configuration_error_does_not_fallback():
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        raise AIProviderConfigurationError(
            reason_code='gemini_api_key_missing',
            message='GEMINI_API_KEY is not configured',
        )

    with pytest.raises(AIProviderConfigurationError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.GEMINI,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    assert attempts == [AIProvider.GEMINI]


def test_primary_provider_configuration_validation_does_not_try_fallback():
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        raise AIProviderConfigurationError(
            reason_code='openrouter_api_key_missing',
            message='OPENROUTER_API_KEY is not configured',
        )

    with pytest.raises(AIProviderConfigurationError):
        validate_primary_provider_configuration(
            AIProvider.OPENROUTER,
            provider_factory=provider_factory,
        )

    assert attempts == [AIProvider.OPENROUTER]
