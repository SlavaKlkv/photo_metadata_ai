import pytest

from app.core.enums import AIProvider
from app.services.ai import provider_cooldown
from app.services.ai.constants import PROVIDER_COOLDOWN_MAX_SECONDS


class _FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def time(self) -> float:
        return self.value


@pytest.fixture
def clock(monkeypatch) -> _FakeClock:
    fake_clock = _FakeClock()
    monkeypatch.setattr(provider_cooldown, '_now', fake_clock.time)
    provider_cooldown.reset_provider_cooldowns()
    yield fake_clock
    provider_cooldown.reset_provider_cooldowns()


def test_provider_without_cooldown_is_available(clock):
    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 0.0


def test_cooldown_counts_down_and_expires(clock):
    provider_cooldown.mark_provider_cooldown(AIProvider.GEMINI, 30.0)

    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 30.0

    clock.value = 10.0
    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 20.0

    clock.value = 30.0
    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 0.0


def test_cooldown_is_capped(clock):
    applied = provider_cooldown.mark_provider_cooldown(
        AIProvider.OPENROUTER,
        10_000.0,
    )

    assert applied == PROVIDER_COOLDOWN_MAX_SECONDS
    assert (
        provider_cooldown.get_cooldown_remaining(AIProvider.OPENROUTER)
        == PROVIDER_COOLDOWN_MAX_SECONDS
    )


def test_shorter_cooldown_does_not_shorten_active_one(clock):
    provider_cooldown.mark_provider_cooldown(AIProvider.GEMINI, 60.0)
    provider_cooldown.mark_provider_cooldown(AIProvider.GEMINI, 5.0)

    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 60.0


def test_cooldown_is_per_provider(clock):
    provider_cooldown.mark_provider_cooldown(AIProvider.GEMINI, 30.0)

    assert provider_cooldown.get_cooldown_remaining(AIProvider.OLLAMA) == 0.0


def test_reset_clears_all_cooldowns(clock):
    provider_cooldown.mark_provider_cooldown(AIProvider.GEMINI, 30.0)
    provider_cooldown.mark_provider_cooldown(AIProvider.OLLAMA, 30.0)

    provider_cooldown.reset_provider_cooldowns()

    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 0.0
    assert provider_cooldown.get_cooldown_remaining(AIProvider.OLLAMA) == 0.0
