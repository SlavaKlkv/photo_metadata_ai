import asyncio

import pytest

from app.core.enums import AIProvider
from app.services.ai import provider_throttle
from app.services.ai.constants import (
    THROTTLE_INCREASE_AFTER_SUCCESSES,
    THROTTLE_MAX_LIMIT,
    THROTTLE_MIN_LIMIT,
    THROTTLE_START_LIMIT,
)


@pytest.fixture(autouse=True)
def reset_throttle():
    provider_throttle.reset_provider_throttle()
    yield
    provider_throttle.reset_provider_throttle()


def test_try_acquire_up_to_floor_of_limit():
    acquired = [
        provider_throttle.try_acquire(AIProvider.GEMINI)
        for _ in range(int(THROTTLE_START_LIMIT) + 2)
    ]

    assert acquired[: int(THROTTLE_START_LIMIT)] == [True] * int(
        THROTTLE_START_LIMIT
    )
    assert acquired[int(THROTTLE_START_LIMIT) :] == [False, False]
    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 0


def test_rate_limited_halves_limit_not_below_min():
    provider_throttle.record_rate_limited(AIProvider.GEMINI)

    # 3.0 -> 1.5 -> floor 1 слот.
    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 1

    for _ in range(5):
        provider_throttle.record_rate_limited(AIProvider.GEMINI)

    assert provider_throttle.try_acquire(AIProvider.GEMINI) is True
    assert provider_throttle.try_acquire(AIProvider.GEMINI) is False
    # Ниже минимума не опускается.
    assert THROTTLE_MIN_LIMIT == 1.0


def test_success_streak_increases_limit_up_to_max():
    provider_throttle.record_rate_limited(AIProvider.GEMINI)
    provider_throttle.record_rate_limited(AIProvider.GEMINI)
    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 1

    for _ in range(THROTTLE_INCREASE_AFTER_SUCCESSES):
        provider_throttle.record_success(AIProvider.GEMINI)

    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 2

    # Не выше максимума.
    for _ in range(THROTTLE_INCREASE_AFTER_SUCCESSES * 5):
        provider_throttle.record_success(AIProvider.GEMINI)

    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == int(
        THROTTLE_MAX_LIMIT
    )


@pytest.mark.asyncio
async def test_release_wakes_waiting_acquire():
    provider_throttle.record_rate_limited(AIProvider.GEMINI)
    provider_throttle.record_rate_limited(AIProvider.GEMINI)
    # Ёмкость 1 — занимаем единственный слот.
    assert provider_throttle.try_acquire(AIProvider.GEMINI) is True

    waiter = asyncio.create_task(provider_throttle.acquire(AIProvider.GEMINI))
    await asyncio.sleep(0)
    assert waiter.done() is False

    await provider_throttle.release(AIProvider.GEMINI)
    await asyncio.wait_for(waiter, timeout=1.0)

    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 0


def test_reset_clears_state():
    provider_throttle.try_acquire(AIProvider.GEMINI)
    provider_throttle.record_rate_limited(AIProvider.OLLAMA)

    provider_throttle.reset_provider_throttle()

    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == int(
        THROTTLE_START_LIMIT
    )
    assert provider_throttle.get_available_capacity(AIProvider.OLLAMA) == int(
        THROTTLE_START_LIMIT
    )
