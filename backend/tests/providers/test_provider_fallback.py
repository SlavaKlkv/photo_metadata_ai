from pathlib import Path

import pytest

from app.core.enums import AIProvider
from app.core.exceptions import AIProviderConfigurationError
from app.services.ai import ai_fallback
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


def _set_added_providers(monkeypatch, added: set[AIProvider]) -> None:
    monkeypatch.setattr(
        ai_fallback,
        'is_provider_added',
        lambda provider: provider in added,
    )


def test_provider_fallback_order_starts_from_selected_provider(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )

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


def test_fallback_chain_excludes_not_added_providers(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.OPENROUTER},
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OLLAMA)
    ] == [
        AIProvider.OLLAMA,
        AIProvider.OPENROUTER,
    ]


def test_fallback_chain_keeps_selected_provider_even_if_not_added(
    monkeypatch,
):
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OLLAMA,
    ]


def test_is_provider_added_requires_api_key_for_cloud_providers(monkeypatch):
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: None,
    )

    assert ai_fallback.is_provider_added(AIProvider.OLLAMA) is True
    assert ai_fallback.is_provider_added(AIProvider.MOCK) is True
    assert ai_fallback.is_provider_added(AIProvider.GEMINI) is False
    assert ai_fallback.is_provider_added(AIProvider.OPENROUTER) is False

    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: 'stored-api-key',
    )

    assert ai_fallback.is_provider_added(AIProvider.GEMINI) is True
    assert ai_fallback.is_provider_added(AIProvider.OPENROUTER) is True


@pytest.mark.asyncio
async def test_runtime_error_falls_back_to_next_provider(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
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
async def test_fallback_skips_not_added_provider(monkeypatch):
    """Регрессия: недобавленный провайдер не участвует в fallback
    и не прерывает обработку ошибкой конфигурации."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.OLLAMA:
            return _RuntimeFailingProvider(model=model)
        if provider == AIProvider.GEMINI:
            raise AIProviderConfigurationError(
                reason_code='gemini_api_key_missing',
                message='GEMINI_API_KEY is not configured',
            )
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OPENROUTER
    assert result.metadata.title == 'Fallback title'
    assert attempts == [AIProvider.OLLAMA, AIProvider.OPENROUTER]


@pytest.mark.asyncio
async def test_configuration_error_of_primary_does_not_fallback(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
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


@pytest.mark.asyncio
async def test_configuration_error_of_fallback_provider_continues_chain(
    monkeypatch,
):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.GEMINI:
            return _RuntimeFailingProvider(model=model)
        if provider == AIProvider.OPENROUTER:
            raise AIProviderConfigurationError(
                reason_code='openrouter_api_key_missing',
                message='OPENROUTER_API_KEY is not configured',
            )
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OLLAMA
    assert result.metadata.title == 'Fallback title'
    assert attempts == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]


def test_primary_provider_configuration_validation_does_not_try_fallback(
    monkeypatch,
):
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})
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
