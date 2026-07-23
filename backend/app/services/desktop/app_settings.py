from dataclasses import dataclass
from typing import Any

import structlog

from app.core.config import settings
from app.core.enums import AIProvider
from app.schemas.desktop import DesktopSettingsResponse
from app.services.ai.constants import FALLBACK_NEXT_PROVIDER
from app.storage.desktop_settings import (
    load_desktop_settings_payload,
    write_desktop_settings_payload,
)

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class EffectiveAISettings:
    provider: AIProvider
    model: str | None


def get_desktop_settings() -> DesktopSettingsResponse:
    payload = load_desktop_settings_payload()
    selected_provider = _resolve_selected_provider(payload)
    effective_settings = resolve_effective_ai_settings(selected_provider)

    return DesktopSettingsResponse(
        selected_provider=selected_provider,
        effective_provider=effective_settings.provider,
        effective_model=effective_settings.model,
        disabled_providers=_extract_disabled_providers(payload),
    )


def update_desktop_settings(
    selected_provider: AIProvider | None = None,
    disabled_providers: list[AIProvider] | None = None,
) -> DesktopSettingsResponse:
    """
    Частичное обновление настроек: не переданные поля сохраняют текущее
    значение, поэтому смена провайдера не сбрасывает список отключённых.
    """
    payload = load_desktop_settings_payload()

    if selected_provider is None:
        selected_provider = _resolve_selected_provider(payload)

    if disabled_providers is None:
        stored_disabled = _extract_disabled_providers(payload)
    else:
        stored_disabled = sorted(
            {provider.value for provider in disabled_providers}
        )

    # Выключенный провайдер не может оставаться выбранным: передаём выбор
    # дальше по кольцу fallback, на первого включённого.
    if selected_provider.value in stored_disabled:
        selected_provider = _next_enabled_provider(
            selected_provider,
            stored_disabled,
        )

    effective_settings = resolve_effective_ai_settings(selected_provider)
    payload = {
        **payload,
        'selected_provider': selected_provider.value,
        'disabled_providers': stored_disabled,
    }
    settings_path = write_desktop_settings_payload(payload)
    logger.info(
        'desktop_settings_saved',
        selected_provider=selected_provider,
        effective_model=effective_settings.model,
        disabled_providers=stored_disabled,
        path=str(settings_path),
    )

    return DesktopSettingsResponse(
        selected_provider=selected_provider,
        effective_provider=effective_settings.provider,
        effective_model=effective_settings.model,
        disabled_providers=stored_disabled,
    )


def _next_enabled_provider(
    selected_provider: AIProvider,
    disabled_providers: list[str],
) -> AIProvider:
    """
    Следующий включённый провайдер в кольце fallback. Если выключены все,
    выбор остаётся прежним — иначе настройки остались бы без провайдера.
    """
    provider = FALLBACK_NEXT_PROVIDER.get(selected_provider)

    while provider is not None and provider != selected_provider:
        if provider.value not in disabled_providers:
            return provider

        provider = FALLBACK_NEXT_PROVIDER.get(provider)

    return selected_provider


def get_disabled_providers() -> set[AIProvider]:
    """Провайдеры, выключенные пользователем в AI Setup."""
    return {
        AIProvider(provider)
        for provider in _extract_disabled_providers(
            load_desktop_settings_payload()
        )
    }


def _extract_disabled_providers(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []

    raw_providers = payload.get('disabled_providers')

    if not isinstance(raw_providers, list):
        return []

    providers: set[str] = set()

    for raw_provider in raw_providers:
        if not isinstance(raw_provider, str):
            continue

        try:
            providers.add(AIProvider(raw_provider).value)
        except ValueError:
            logger.warning(
                'desktop_settings_disabled_provider_invalid',
                provider=raw_provider,
            )

    return sorted(providers)


def resolve_effective_ai_settings(
    selected_provider: AIProvider | None,
) -> EffectiveAISettings:
    provider = AIProvider(
        selected_provider or get_desktop_settings().selected_provider
    )

    provider_models: dict[AIProvider, str | None] = {
        AIProvider.MOCK: None,
        AIProvider.OLLAMA: settings.OLLAMA_REQUIRED_MODEL,
        AIProvider.GEMINI: settings.GEMINI_MODEL,
        AIProvider.OPENROUTER: settings.OPENROUTER_MODEL,
    }

    return EffectiveAISettings(
        provider=provider,
        model=provider_models[provider],
    )


def _resolve_selected_provider(payload: Any) -> AIProvider:
    selected_provider = _extract_selected_provider(payload)

    if selected_provider is None:
        return AIProvider(settings.DEFAULT_AI_PROVIDER)

    return selected_provider


def _extract_selected_provider(payload: Any) -> AIProvider | None:
    if not isinstance(payload, dict):
        return None

    raw_provider = payload.get('selected_provider')

    if not isinstance(raw_provider, str):
        return None

    try:
        return AIProvider(raw_provider)
    except ValueError:
        logger.warning(
            'desktop_settings_provider_invalid',
            selected_provider=raw_provider,
        )
        return None
