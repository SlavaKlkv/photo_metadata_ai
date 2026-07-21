import asyncio
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

import httpx
import structlog
from fastapi import HTTPException

from app.core.config import settings
from app.core.enums import AIProvider, StockPlatform
from app.core.exceptions import (
    AIProviderConfigurationError,
    AIProviderRuntimeError,
)
from app.services.ai.ai_provider import (
    AIMetadataResponse,
    BaseAIProvider,
    get_ai_provider,
)
from app.services.ai.constants import (
    AI_FALLBACK_BUDGET_SECONDS,
    AI_FALLBACK_CYCLE_BASE_DELAY,
    AI_FALLBACK_CYCLE_MAX_DELAY,
    AI_FALLBACK_MAX_CYCLES,
    FALLBACK_NEXT_PROVIDER,
    PROVIDER_COOLDOWN_DEFAULT_SECONDS,
    RETRYABLE_HTTP_STATUSES,
)
from app.services.ai.provider_cooldown import (
    get_cooldown_remaining,
    mark_provider_cooldown,
)
from app.services.ai.provider_throttle import (
    acquire,
    get_available_capacity,
    record_rate_limited,
    record_success,
    release,
    try_acquire,
)
from app.services.desktop.ai_provider_api_keys import get_ai_provider_api_key
from app.services.desktop.constants import SUPPORTED_AI_API_KEY_PROVIDERS

logger = structlog.get_logger(__name__)

ProviderFactory = Callable[[AIProvider, str | None], BaseAIProvider]


@dataclass(frozen=True)
class FallbackAttempt:
    provider: AIProvider
    model: str | None


ProviderAttemptCallback = Callable[[FallbackAttempt], Awaitable[None]]


@dataclass(frozen=True)
class FallbackMetadataResult:
    metadata: AIMetadataResponse
    provider: AIProvider
    model: str | None


def _now() -> float:
    """Монотонные часы loop. Отдельная функция — точка подмены в тестах."""
    return asyncio.get_running_loop().time()


async def _sleep(delay: float) -> None:
    """
    Ожидание между попытками. `CancelledError` наследует `BaseException`,
    поэтому отмена задания проходит сквозь `except Exception` в цикле попыток
    и прерывает ожидание немедленно.
    """
    await asyncio.sleep(delay)


def is_provider_added(provider: AIProvider) -> bool:
    """
    Провайдер считается добавленным, если для него не нужен API-ключ
    или ключ сохранён в desktop-хранилище либо окружении.
    """
    if provider not in SUPPORTED_AI_API_KEY_PROVIDERS:
        return True

    return get_ai_provider_api_key(provider) is not None


def build_provider_fallback_chain(
    selected_provider: AIProvider,
) -> list[FallbackAttempt]:
    seen: set[AIProvider] = set()
    attempts: list[FallbackAttempt] = []
    provider: AIProvider | None = selected_provider

    while provider is not None and provider not in seen:
        seen.add(provider)
        current, provider = provider, FALLBACK_NEXT_PROVIDER.get(provider)

        # Выбранный провайдер остаётся в кольце даже без ключа, чтобы
        # пользователь получил понятную ошибку конфигурации; fallback
        # выполняется только на добавленных провайдеров.
        if current != selected_provider and not is_provider_added(current):
            continue

        attempts.append(
            FallbackAttempt(
                provider=current,
                model=resolve_provider_model(current),
            )
        )

    return attempts


def resolve_provider_model(provider: AIProvider) -> str | None:
    provider_models: dict[AIProvider, str | None] = {
        AIProvider.MOCK: None,
        AIProvider.OLLAMA: settings.OLLAMA_REQUIRED_MODEL,
        AIProvider.GEMINI: settings.GEMINI_MODEL,
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
    on_attempt_started: ProviderAttemptCallback | None = None,
) -> FallbackMetadataResult:
    attempts = build_provider_fallback_chain(selected_provider)

    if not attempts:
        raise AIProviderRuntimeError(
            reason_code='fallback_chain_empty',
            message='AI provider fallback chain is empty',
        )

    deadline = _now() + AI_FALLBACK_BUDGET_SECONDS
    # Провайдеры, выбывшие по ошибке конфигурации: до конца обработки файла
    # они из кольца исключены.
    excluded: set[AIProvider] = set()
    last_error: Exception | None = None
    cycle = 0

    while cycle < AI_FALLBACK_MAX_CYCLES:
        available = [
            attempt for attempt in attempts if attempt.provider not in excluded
        ]

        if not available:
            break

        for index, attempt in enumerate(available):
            cooldown_wait = _resolve_cooldown_wait(attempt, available)

            if cooldown_wait is None:
                logger.info(
                    'ai_provider_cooldown_skipped',
                    provider=attempt.provider,
                    cycle=cycle,
                    file_number=file_number,
                )
                continue

            if cooldown_wait > 0.0:
                if _now() + cooldown_wait >= deadline:
                    break

                await _sleep(cooldown_wait)

            # Адаптивная ёмкость провайдера: если свободного слота нет, но в
            # кольце есть другой доступный кандидат — пропускаем остывающего;
            # если кандидат единственный — ждём слот.
            if not try_acquire(attempt.provider):
                if _has_available_alternative(attempt, available):
                    logger.info(
                        'ai_provider_throttle_skipped',
                        provider=attempt.provider,
                        cycle=cycle,
                        file_number=file_number,
                    )
                    continue

                await acquire(attempt.provider)

            try:
                try:
                    if on_attempt_started is not None:
                        await on_attempt_started(attempt)

                    provider = provider_factory(
                        attempt.provider, attempt.model
                    )
                    metadata = await provider.generate_metadata(
                        image_path,
                        shooting_context=shooting_context,
                        file_number=file_number,
                        stock_platform=stock_platform,
                    )
                except Exception as error:
                    last_error = error
                    reason_code = get_provider_error_reason_code(error)
                    _penalize_provider(error, attempt.provider)

                    if is_provider_configuration_error(error):
                        logger.warning(
                            'ai_provider_fallback_config_error',
                            provider=attempt.provider,
                            reason_code=reason_code,
                            cycle=cycle,
                            file_number=file_number,
                        )
                        # Ошибка конфигурации выбранного провайдера на самой
                        # первой попытке отдаётся пользователю как есть; на
                        # fallback-позициях — выводит провайдера из кольца.
                        if cycle == 0 and index == 0:
                            raise

                        excluded.add(attempt.provider)
                        continue

                    next_attempt = available[(index + 1) % len(available)]
                    logger.warning(
                        'ai_provider_fallback_switch',
                        from_provider=attempt.provider,
                        to_provider=next_attempt.provider,
                        reason_code=reason_code,
                        cycle=cycle,
                        file_number=file_number,
                    )
                    continue

                record_success(attempt.provider)

                if cycle > 0 or index > 0:
                    logger.info(
                        'ai_provider_fallback_succeeded',
                        provider=attempt.provider,
                        model=attempt.model,
                        cycle=cycle,
                        file_number=file_number,
                    )

                return FallbackMetadataResult(
                    metadata=metadata,
                    provider=attempt.provider,
                    model=attempt.model,
                )
            finally:
                await release(attempt.provider)

        cycle += 1
        cycle_delay = _resolve_cycle_delay(cycle)

        if cycle >= AI_FALLBACK_MAX_CYCLES:
            break

        if _now() + cycle_delay >= deadline:
            break

        logger.info(
            'ai_provider_fallback_cycle_restart',
            cycle=cycle,
            delay=cycle_delay,
            file_number=file_number,
        )
        await _sleep(cycle_delay)

    logger.warning(
        'ai_provider_fallback_exhausted',
        cycles=cycle,
        reason_code=(
            get_provider_error_reason_code(last_error)
            if last_error is not None
            else None
        ),
        file_number=file_number,
    )

    if last_error is not None:
        raise last_error

    raise AIProviderRuntimeError(
        reason_code='fallback_chain_empty',
        message='AI provider fallback chain is empty',
    )


def _resolve_cooldown_wait(
    attempt: FallbackAttempt,
    available: list[FallbackAttempt],
) -> float | None:
    """
    Сколько ждать перед попыткой: 0.0 — провайдер свободен, None — пропустить
    его в этом круге, положительное число — ждать снятия rate limit.

    Ждём только когда ждать больше нечего: если в кольце есть другой свободный
    провайдер, остывающий пропускается. При единственном провайдере ожидание —
    единственный способ пережить 429, поэтому файл ждёт, а не падает.
    """
    remaining = get_cooldown_remaining(attempt.provider)

    if remaining <= 0.0:
        return 0.0

    if _has_available_alternative(attempt, available):
        return None

    return remaining


def _has_available_alternative(
    attempt: FallbackAttempt,
    available: list[FallbackAttempt],
) -> bool:
    """
    Есть ли в кольце другой провайдер, готовый принять запрос прямо сейчас —
    не под cooldown и со свободным слотом ёмкости.
    """
    return any(
        candidate.provider != attempt.provider
        and get_cooldown_remaining(candidate.provider) <= 0.0
        and get_available_capacity(candidate.provider) > 0
        for candidate in available
    )


def _resolve_cycle_delay(cycle: int) -> float:
    """Экспоненциальный backoff с полным джиттером перед кругом `cycle`."""
    delay = min(
        AI_FALLBACK_CYCLE_BASE_DELAY * 2 ** (cycle - 1),
        AI_FALLBACK_CYCLE_MAX_DELAY,
    )
    return random.uniform(0.0, delay)


def _penalize_provider(error: Exception, provider: AIProvider) -> None:
    """
    Штраф провайдеру за retryable-ошибку: cooldown-пауза и сужение адаптивной
    ёмкости. Конфиг-ошибки (4xx) сюда не попадают.
    """
    status_code = get_provider_error_status_code(error)

    if status_code not in RETRYABLE_HTTP_STATUSES:
        return

    record_rate_limited(provider)

    retry_after = get_retry_after_seconds(error)
    mark_provider_cooldown(
        provider,
        retry_after
        if retry_after is not None
        else PROVIDER_COOLDOWN_DEFAULT_SECONDS,
    )


def get_provider_error_status_code(error: Exception) -> int | None:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code

    if isinstance(error, HTTPException):
        return error.status_code

    return None


def get_retry_after_seconds(error: Exception) -> float | None:
    """
    Заголовок `Retry-After` в секундах. Форма с HTTP-датой не поддерживается —
    в таком случае применяется дефолтный cooldown.
    """
    headers: object = None

    if isinstance(error, httpx.HTTPStatusError):
        headers = error.response.headers
    elif isinstance(error, HTTPException):
        headers = error.headers

    if headers is None:
        return None

    raw_value = headers.get('Retry-After')  # type: ignore[attr-defined]

    if raw_value is None:
        return None

    try:
        seconds = float(raw_value)
    except (TypeError, ValueError):
        return None

    return seconds if seconds >= 0.0 else None


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
