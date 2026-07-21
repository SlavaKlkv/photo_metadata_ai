"""
Общее на процесс состояние «провайдер под rate limit».

Cooldown разделяется между всеми файлами задания: 429 от провайдера ставит его
на паузу один раз, и остальные параллельные файлы уже не бьются в тот же лимит.
"""

import asyncio

import structlog

from app.core.enums import AIProvider
from app.services.ai.constants import PROVIDER_COOLDOWN_MAX_SECONDS

logger = structlog.get_logger(__name__)

# Провайдер -> момент монотонных часов event loop, до которого он на паузе.
_cooldown_until: dict[AIProvider, float] = {}


def _now() -> float:
    """Монотонные часы loop. Отдельная функция — точка подмены в тестах."""
    return asyncio.get_running_loop().time()


def mark_provider_cooldown(provider: AIProvider, seconds: float) -> float:
    """
    Ставит провайдера на паузу и возвращает применённую длительность.

    Более длинная пауза не сокращает уже действующую.
    """
    duration = max(0.0, min(seconds, PROVIDER_COOLDOWN_MAX_SECONDS))
    until = _now() + duration
    _cooldown_until[provider] = max(_cooldown_until.get(provider, 0.0), until)

    logger.warning(
        'ai_provider_cooldown_started',
        provider=provider,
        duration=duration,
    )
    return duration


def get_cooldown_remaining(provider: AIProvider) -> float:
    """Остаток паузы в секундах; 0.0 — провайдер доступен."""
    until = _cooldown_until.get(provider)

    if until is None:
        return 0.0

    remaining = until - _now()

    if remaining <= 0.0:
        del _cooldown_until[provider]
        return 0.0

    return remaining


def reset_provider_cooldowns() -> None:
    _cooldown_until.clear()
