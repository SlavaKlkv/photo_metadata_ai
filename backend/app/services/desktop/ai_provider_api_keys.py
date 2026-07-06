import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import httpx
import structlog
from pydantic import SecretStr

from app.core.config import settings
from app.core.enums import AIProvider
from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.schemas.ai_provider_api_key import AIProviderApiKeyValidationResponse
from app.services.desktop.constants import (
    AI_PROVIDER_API_KEY_ENV_VARS,
    AI_PROVIDER_API_KEY_VALIDATION_TIMEOUT_SECONDS,
    SUPPORTED_AI_API_KEY_PROVIDERS,
)
from app.storage.constants import AI_PROVIDER_API_KEYS_FILENAME

logger = structlog.get_logger(__name__)

AIProviderApiKeySource = Literal['desktop_storage', 'environment']


@dataclass(frozen=True)
class AIProviderApiKeyInfo:
    provider: AIProvider
    api_key: str
    source: AIProviderApiKeySource
    display_source: str
    display_value: str
    env_var: str | None = None


async def validate_and_save_ai_provider_api_key(
    provider: AIProvider,
    api_key: SecretStr,
) -> AIProviderApiKeyValidationResponse:
    _ensure_supported_provider(provider)

    normalized_api_key = api_key.get_secret_value().strip()
    is_valid = await validate_ai_provider_api_key(provider, normalized_api_key)

    if not is_valid:
        reason_code = f'{provider.value}_api_key_invalid'
        logger.info(
            'ai_provider_api_key_validation_rejected',
            provider=provider.value,
            reason_code=reason_code,
        )
        return AIProviderApiKeyValidationResponse(
            provider=provider,
            valid=False,
            status='invalid',
            reason_code=reason_code,
            message='Invalid API key',
            saved=False,
        )

    save_ai_provider_api_key(provider, normalized_api_key)

    logger.info(
        'ai_provider_api_key_validated_and_saved',
        provider=provider.value,
    )
    return AIProviderApiKeyValidationResponse(
        provider=provider,
        valid=True,
        status='valid',
        message='API key is valid',
        saved=True,
    )


def save_ai_provider_api_key(
    provider: AIProvider,
    api_key: str,
) -> None:
    """
    Сохраняет уже проверенный API-ключ в локальное desktop-хранилище.
    """
    _ensure_supported_provider(provider)

    normalized_api_key = _normalize_api_key(api_key)
    if normalized_api_key is None:
        raise ValueError('api_key is required')

    records = _load_api_key_records()
    now = datetime.now(UTC).isoformat()
    records[provider.value] = {
        'provider': provider.value,
        'api_key': normalized_api_key,
        'source': 'desktop_storage',
        'last_validated_at': now,
        'updated_at': now,
    }
    _write_api_key_records(records)


async def validate_ai_provider_api_key(
    provider: AIProvider,
    api_key: str,
) -> bool:
    _ensure_supported_provider(provider)

    if provider == AIProvider.GEMINI:
        return await _validate_gemini_api_key(api_key)

    if provider == AIProvider.OPENROUTER:
        return await _validate_openrouter_api_key(api_key)

    return False


def get_ai_provider_api_key(provider: AIProvider) -> str | None:
    api_key_info = get_ai_provider_api_key_info(provider)

    if api_key_info is None:
        return None

    return api_key_info.api_key


def get_ai_provider_api_key_info(
    provider: AIProvider,
) -> AIProviderApiKeyInfo | None:
    if provider not in SUPPORTED_AI_API_KEY_PROVIDERS:
        return None

    stored_api_key = _get_stored_api_key(provider)
    if stored_api_key is not None:
        return AIProviderApiKeyInfo(
            provider=provider,
            api_key=stored_api_key,
            source='desktop_storage',
            display_source='desktop storage',
            display_value='Saved API key',
        )

    env_var = _get_api_key_env_var(provider)
    environment_api_key = _normalize_api_key(getattr(settings, env_var))

    if environment_api_key is None:
        return None

    return AIProviderApiKeyInfo(
        provider=provider,
        api_key=environment_api_key,
        source='environment',
        display_source=env_var,
        display_value=f'Configured {env_var}',
        env_var=env_var,
    )


def _validate_provider_value(provider: AIProvider) -> None:
    if provider not in SUPPORTED_AI_API_KEY_PROVIDERS:
        raise ValueError(
            f'{provider.value} does not support API key validation'
        )


def _ensure_supported_provider(provider: AIProvider) -> None:
    _validate_provider_value(provider)


async def _validate_gemini_api_key(api_key: str) -> bool:
    try:
        async with httpx.AsyncClient(
            timeout=AI_PROVIDER_API_KEY_VALIDATION_TIMEOUT_SECONDS,
        ) as client:
            response = await client.get(
                f'{settings.GEMINI_BASE_URL}/models/{settings.GEMINI_MODEL}',
                headers={'x-goog-api-key': api_key},
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        logger.info(
            'gemini_api_key_validation_failed',
            reason_code='gemini_api_key_invalid',
            error=str(error),
        )
        return False

    return True


async def _validate_openrouter_api_key(api_key: str) -> bool:
    try:
        async with httpx.AsyncClient(
            timeout=AI_PROVIDER_API_KEY_VALIDATION_TIMEOUT_SECONDS,
        ) as client:
            response = await client.get(
                f'{settings.OPENROUTER_BASE_URL}/key',
                headers={'Authorization': f'Bearer {api_key}'},
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        logger.info(
            'openrouter_api_key_validation_failed',
            reason_code='openrouter_api_key_invalid',
            error=str(error),
        )
        return False

    return True


def _get_stored_api_key(provider: AIProvider) -> str | None:
    records = _load_api_key_records()
    record = records.get(provider.value)

    if not isinstance(record, dict):
        return None

    return _normalize_api_key(record.get('api_key'))


def _load_api_key_records() -> dict[str, dict[str, Any]]:
    api_keys_path = _get_api_keys_path()

    records = _read_api_key_records(api_keys_path)
    if records is not None:
        return records

    return {}


def _read_api_key_records(
    api_keys_path: Path,
) -> dict[str, dict[str, Any]] | None:
    if not api_keys_path.is_file():
        return None

    try:
        payload = json.loads(api_keys_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning(
            'ai_provider_api_keys_load_failed',
            path=str(api_keys_path),
            error_type=type(error).__name__,
        )
        return {}

    if not isinstance(payload, dict):
        return {}

    return {
        str(provider): record
        for provider, record in payload.items()
        if isinstance(record, dict)
    }


def _write_api_key_records(records: dict[str, dict[str, Any]]) -> None:
    api_keys_path = _get_api_keys_path()
    api_keys_path.parent.mkdir(parents=True, exist_ok=True)
    api_keys_path.write_text(
        json.dumps(records, indent=2, sort_keys=True),
        encoding='utf-8',
    )

    try:
        os.chmod(api_keys_path, 0o600)
    except OSError as error:
        logger.warning(
            'ai_provider_api_keys_chmod_failed',
            path=str(api_keys_path),
            error_type=type(error).__name__,
        )


def _get_api_keys_path() -> Path:
    runtime_directories = ensure_runtime_directories()
    return resolve_path_in_base(
        runtime_directories.desktop_storage_dir,
        AI_PROVIDER_API_KEYS_FILENAME,
    )


def _get_api_key_env_var(provider: AIProvider) -> str:
    return AI_PROVIDER_API_KEY_ENV_VARS[provider]


def _normalize_api_key(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    return normalized or None
