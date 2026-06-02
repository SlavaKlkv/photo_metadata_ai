import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from app.core.config import settings
from app.core.enums import AIProvider
from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.schemas.desktop import DesktopSettingsResponse

logger = structlog.get_logger(__name__)

SETTINGS_FILENAME = 'desktop_settings.json'


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
    settings_path = _get_settings_path()
    payload = {'selected_provider': selected_provider.value}

    settings_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True),
        encoding='utf-8',
    )
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
        AIProvider.GEMINI: None,
        AIProvider.OPENROUTER: settings.OPENROUTER_MODEL,
    }

    return EffectiveAISettings(
        provider=provider,
        model=provider_models[provider],
    )


def _load_selected_provider() -> AIProvider:
    settings_path = _get_settings_path()

    if not settings_path.is_file():
        return AIProvider(settings.DEFAULT_AI_PROVIDER)

    try:
        payload = json.loads(settings_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning(
            'desktop_settings_load_failed',
            path=str(settings_path),
            error=str(error),
        )
        return AIProvider(settings.DEFAULT_AI_PROVIDER)

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


def _get_settings_path() -> Path:
    runtime_directories = ensure_runtime_directories()
    return resolve_path_in_base(
        runtime_directories.workspace_dir,
        SETTINGS_FILENAME,
    )
