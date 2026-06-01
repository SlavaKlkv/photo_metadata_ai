from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import httpx
import structlog
from fastapi import HTTPException

from app.core.config import settings
from app.core.enums import AIProvider, StockPlatform
from app.services.ai_provider import (
    AIMetadataResponse,
    AIProviderConfigurationError,
    AIProviderRuntimeError,
    BaseAIProvider,
    get_ai_provider,
)

logger = structlog.get_logger(__name__)

ProviderFactory = Callable[[AIProvider, str | None], BaseAIProvider]


@dataclass(frozen=True)
class FallbackAttempt:
    provider: AIProvider
    model: str | None


@dataclass(frozen=True)
class FallbackMetadataResult:
    metadata: AIMetadataResponse
    provider: AIProvider
    model: str | None


FALLBACK_CHAINS: dict[AIProvider, tuple[AIProvider, ...]] = {
    AIProvider.OLLAMA: (
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ),
    AIProvider.GEMINI: (
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ),
    AIProvider.OPENROUTER: (
        AIProvider.OPENROUTER,
        AIProvider.GEMINI,
        AIProvider.OLLAMA,
    ),
    AIProvider.MOCK: (AIProvider.MOCK,),
}


def build_provider_fallback_chain(
    selected_provider: AIProvider,
) -> list[FallbackAttempt]:
    providers = FALLBACK_CHAINS.get(selected_provider, (selected_provider,))
    seen: set[AIProvider] = set()
    attempts: list[FallbackAttempt] = []

    for provider in providers:
        if provider in seen:
            continue

        seen.add(provider)
        attempts.append(
            FallbackAttempt(
                provider=provider,
                model=resolve_provider_model(provider),
            )
        )

    return attempts


def resolve_provider_model(provider: AIProvider) -> str | None:
    provider_models: dict[AIProvider, str | None] = {
        AIProvider.MOCK: None,
        AIProvider.OLLAMA: settings.OLLAMA_REQUIRED_MODEL,
        AIProvider.GEMINI: None,
        AIProvider.OPENROUTER: settings.OPENROUTER_MODEL,
    }
    return provider_models[provider]


def create_provider(
    provider: AIProvider,
    model: str | None,
) -> BaseAIProvider:
    return get_ai_provider(provider, model=model)


def validate_primary_provider_configuration(
    selected_provider: AIProvider,
    provider_factory: ProviderFactory = create_provider,
) -> None:
    primary_attempt = build_provider_fallback_chain(selected_provider)[0]
    provider_factory(primary_attempt.provider, primary_attempt.model)


async def generate_metadata_with_fallback(
    *,
    selected_provider: AIProvider,
    image_path: Path,
    shooting_context: str | None = None,
    file_number: int | None = None,
    stock_platform: StockPlatform | None = None,
    provider_factory: ProviderFactory = create_provider,
) -> FallbackMetadataResult:
    attempts = build_provider_fallback_chain(selected_provider)
    last_error: Exception | None = None

    for index, attempt in enumerate(attempts):
        try:
            provider = provider_factory(attempt.provider, attempt.model)
            metadata = await provider.generate_metadata(
                image_path,
                shooting_context=shooting_context,
                file_number=file_number,
                stock_platform=stock_platform,
            )
            if index > 0:
                logger.info(
                    'ai_provider_fallback_succeeded',
                    provider=attempt.provider,
                    model=attempt.model,
                    file_number=file_number,
                )
            return FallbackMetadataResult(
                metadata=metadata,
                provider=attempt.provider,
                model=attempt.model,
            )
        except Exception as error:
            if is_provider_configuration_error(error):
                logger.warning(
                    'ai_provider_fallback_config_error',
                    provider=attempt.provider,
                    reason_code=get_provider_error_reason_code(error),
                    file_number=file_number,
                )
                raise

            last_error = error
            reason_code = get_provider_error_reason_code(error)
            next_attempt = (
                attempts[index + 1] if index + 1 < len(attempts) else None
            )

            if next_attempt is None:
                logger.warning(
                    'ai_provider_fallback_exhausted',
                    provider=attempt.provider,
                    reason_code=reason_code,
                    file_number=file_number,
                )
                raise

            logger.warning(
                'ai_provider_fallback_switch',
                from_provider=attempt.provider,
                to_provider=next_attempt.provider,
                reason_code=reason_code,
                file_number=file_number,
            )

    if last_error is not None:
        raise last_error

    raise AIProviderRuntimeError(
        reason_code='fallback_chain_empty',
        message='AI provider fallback chain is empty',
    )


def is_provider_configuration_error(error: Exception) -> bool:
    if isinstance(error, AIProviderConfigurationError):
        return True

    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in {400, 401, 403, 404}

    if isinstance(error, HTTPException):
        return error.status_code in {400, 401, 403, 404}

    return False


def get_provider_error_reason_code(error: Exception) -> str:
    if isinstance(error, AIProviderConfigurationError):
        return error.reason_code

    if isinstance(error, AIProviderRuntimeError):
        return error.reason_code

    if isinstance(error, httpx.TimeoutException):
        return 'provider_timeout'

    if isinstance(error, httpx.ConnectError):
        return 'provider_connection_failed'

    if isinstance(error, httpx.HTTPStatusError):
        return f'provider_http_{error.response.status_code}'

    if isinstance(error, HTTPException):
        return f'provider_http_{error.status_code}'

    return 'provider_runtime_error'
