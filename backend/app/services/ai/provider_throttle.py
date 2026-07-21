"""
Адаптивная ёмкость параллельных запросов на провайдера (AIMD).

Общее на процесс состояние: у каждого провайдера — текущий лимит параллельных
запросов, который сужается после 429 (multiplicative decrease) и расширяется
после серии успехов (additive increase). Это снижает частоту rate limit на
пачках, не срезая общий throughput: облачные провайдеры сами находят
безопасный уровень, локальный Ollama держит максимум.

Синхронизация не нужна для доступа к состоянию (backend однопоточный на одном
event loop); `asyncio.Condition` используется только чтобы будить корутины,
ждущие освобождения слота.
"""

import asyncio
import math

import structlog

from app.core.enums import AIProvider
from app.services.ai.constants import (
    THROTTLE_DECREASE_FACTOR,
    THROTTLE_INCREASE_AFTER_SUCCESSES,
    THROTTLE_MAX_LIMIT,
    THROTTLE_MIN_LIMIT,
    THROTTLE_START_LIMIT,
)

logger = structlog.get_logger(__name__)

_limit: dict[AIProvider, float] = {}
_active: dict[AIProvider, int] = {}
_success_streak: dict[AIProvider, int] = {}
_condition: asyncio.Condition | None = None


def _get_condition() -> asyncio.Condition:
    global _condition

    if _condition is None:
        _condition = asyncio.Condition()

    return _condition


def _current_limit(provider: AIProvider) -> float:
    return _limit.get(provider, THROTTLE_START_LIMIT)


def get_available_capacity(provider: AIProvider) -> int:
    """Свободные слоты провайдера: floor(limit) - active."""
    return math.floor(_current_limit(provider)) - _active.get(provider, 0)


def try_acquire(provider: AIProvider) -> bool:
    """Неблокирующе занять слот, если есть свободный."""
    if get_available_capacity(provider) <= 0:
        return False

    _active[provider] = _active.get(provider, 0) + 1
    return True


async def acquire(provider: AIProvider) -> None:
    """
    Ждать освобождения слота и занять его. Для случая единственного провайдера
    в кольце, когда пропустить его нельзя. `CancelledError` пробрасывается —
    слот при этом не занимается.
    """
    condition = _get_condition()

    async with condition:
        await condition.wait_for(lambda: get_available_capacity(provider) > 0)
        _active[provider] = _active.get(provider, 0) + 1


async def release(provider: AIProvider) -> None:
    """Освободить слот и разбудить ждущих `acquire`."""
    _active[provider] = max(0, _active.get(provider, 0) - 1)

    condition = _get_condition()
    async with condition:
        condition.notify_all()


def record_success(provider: AIProvider) -> None:
    """Успех подряд; по достижении порога расширить ёмкость на 1."""
    streak = _success_streak.get(provider, 0) + 1

    if streak >= THROTTLE_INCREASE_AFTER_SUCCESSES:
        new_limit = min(THROTTLE_MAX_LIMIT, _current_limit(provider) + 1.0)
        _limit[provider] = new_limit
        _success_streak[provider] = 0
        logger.info(
            'ai_provider_throttle_increased',
            provider=provider,
            limit=new_limit,
        )
        return

    _success_streak[provider] = streak


def record_rate_limited(provider: AIProvider) -> None:
    """429: сузить ёмкость вдвое (не ниже минимума), сбросить серию успехов."""
    new_limit = max(
        THROTTLE_MIN_LIMIT,
        _current_limit(provider) * THROTTLE_DECREASE_FACTOR,
    )
    _limit[provider] = new_limit
    _success_streak[provider] = 0
    logger.warning(
        'ai_provider_throttle_decreased',
        provider=provider,
        limit=new_limit,
    )


def reset_provider_throttle() -> None:
    _limit.clear()
    _active.clear()
    _success_streak.clear()

    global _condition
    _condition = None
