from dataclasses import dataclass
from typing import Any

import structlog

from app.core.config import settings
from app.core.enums import AIProvider
from app.schemas.desktop import DesktopSettingsResponse
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
    selected_provider = _load_selected_provider()
    effective_settings = resolve_effective_ai_settings(selected_provider)

    return DesktopSettingsResponse(
        selected_provider=selected_provider,
        effective_provider=effective_settings.provider,
        effective_model=effective_settings.model,
    )


def update_desktop_settings(
    selected_provider: AIProvider,
) -> DesktopSettingsResponse:
    effective_settings = resolve_effective_ai_settings(selected_provider)
    payload = {'selected_provider': selected_provider.value}
    settings_path = write_desktop_settings_payload(payload)
    logger.info(
        'desktop_settings_saved',
        selected_provider=selected_provider,
        effective_model=effective_settings.model,
        path=str(settings_path),
    )

    return DesktopSettingsResponse(
        selected_provider=selected_provider,
        effective_provider=effective_settings.provider,
        effective_model=effective_settings.model,
    )


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


def _load_selected_provider() -> AIProvider:
    payload = load_desktop_settings_payload()
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
