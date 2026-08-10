import asyncio
from pathlib import Path

import httpx
import pytest

from app.core.enums import AIProvider
from app.core.exceptions import AIProviderConfigurationError
from app.services.ai import ai_fallback, provider_cooldown, provider_throttle
from app.services.ai.ai_fallback import (
    build_provider_fallback_chain,
    generate_metadata_with_fallback,
    validate_primary_provider_configuration,
)
from app.services.ai.ai_provider import (
    AIMetadataResponse,
    BaseAIProvider,
)
from app.services.ai.constants import (
    AI_FALLBACK_BUDGET_SECONDS,
    AI_FALLBACK_MAX_CYCLES,
    PROVIDER_COOLDOWN_MAX_SECONDS,
    get_provider_timeout,
)


class _RuntimeFailingProvider(BaseAIProvider):
    async def generate_metadata(self, *args, **kwargs):
        raise RuntimeError('provider temporarily unavailable')


class _SuccessfulProvider(BaseAIProvider):
    async def generate_metadata(self, *args, **kwargs):
        return AIMetadataResponse(
            title='Fallback title',
            description='Fallback description',
            keywords=['fallback', 'metadata'],
        )


class _RateLimitedProvider(BaseAIProvider):
    def __init__(self, *args, retry_after: str | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._retry_after = retry_after

    async def generate_metadata(self, *args, **kwargs):
        raise _http_status_error(429, retry_after=self._retry_after)


class _TimingOutProvider(BaseAIProvider):
    """Проваливается по таймауту, потратив на это своё время по часам."""

    def __init__(self, *args, clock: '_FakeClock', timeout: float, **kwargs):
        super().__init__(*args, **kwargs)
        self._clock = clock
        self._timeout = timeout

    async def generate_metadata(self, *args, **kwargs):
        self._clock.value += self._timeout
        raise httpx.ReadTimeout('provider timed out')


class _CancellingProvider(BaseAIProvider):
    async def generate_metadata(self, *args, **kwargs):
        raise asyncio.CancelledError


class _FakeClock:
    """Монотонные часы и sleep без реального ожидания."""

    def __init__(self) -> None:
        self.value = 0.0

    def time(self) -> float:
        return self.value

    async def sleep(self, delay: float) -> None:
        self.value += delay


def _http_status_error(
    status_code: int,
    retry_after: str | None = None,
) -> httpx.HTTPStatusError:
    request = httpx.Request('POST', 'https://provider.test/v1/generate')
    response = httpx.Response(
        status_code,
        headers={'Retry-After': retry_after} if retry_after else {},
        request=request,
    )
    return httpx.HTTPStatusError(
        'provider rate limited',
        request=request,
        response=response,
    )


@pytest.fixture(autouse=True)
def reset_cooldowns():
    provider_cooldown.reset_provider_cooldowns()
    provider_throttle.reset_provider_throttle()
    yield
    provider_cooldown.reset_provider_cooldowns()
    provider_throttle.reset_provider_throttle()


@pytest.fixture
def clock(monkeypatch) -> _FakeClock:
    fake_clock = _FakeClock()
    monkeypatch.setattr(ai_fallback, '_now', fake_clock.time)
    monkeypatch.setattr(provider_cooldown, '_now', fake_clock.time)
    monkeypatch.setattr(ai_fallback, '_sleep', fake_clock.sleep)
    # Полный джиттер превращаем в детерминированный максимум.
    monkeypatch.setattr(ai_fallback.random, 'uniform', lambda _low, high: high)
    return fake_clock


def _set_added_providers(monkeypatch, added: set[AIProvider]) -> None:
    monkeypatch.setattr(
        ai_fallback,
        'is_provider_added',
        lambda provider: provider in added,
    )


def test_provider_fallback_order_starts_from_selected_provider(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OLLAMA)
    ] == [
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ]
    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]
    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OPENROUTER)
    ] == [
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
    ]


def test_fallback_chain_excludes_not_added_providers(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.OPENROUTER},
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OLLAMA)
    ] == [
        AIProvider.OLLAMA,
        AIProvider.OPENROUTER,
    ]


def test_fallback_chain_keeps_selected_provider_even_if_not_added(
    monkeypatch,
):
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OLLAMA,
    ]


def test_is_provider_added_requires_api_key_for_cloud_providers(monkeypatch):
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: None,
    )

    assert ai_fallback.is_provider_added(AIProvider.OLLAMA) is True
    assert ai_fallback.is_provider_added(AIProvider.MOCK) is True
    assert ai_fallback.is_provider_added(AIProvider.GEMINI) is False
    assert ai_fallback.is_provider_added(AIProvider.OPENROUTER) is False

    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: 'stored-api-key',
    )

    assert ai_fallback.is_provider_added(AIProvider.GEMINI) is True
    assert ai_fallback.is_provider_added(AIProvider.OPENROUTER) is True


@pytest.mark.asyncio
async def test_runtime_error_falls_back_to_next_provider(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.OLLAMA:
            return _RuntimeFailingProvider(model=model)
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.GEMINI
    assert result.metadata.title == 'Fallback title'
    assert attempts == [AIProvider.OLLAMA, AIProvider.GEMINI]


@pytest.mark.asyncio
async def test_fallback_skips_not_added_provider(monkeypatch):
    """Регрессия: недобавленный провайдер не участвует в fallback
    и не прерывает обработку ошибкой конфигурации."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.OLLAMA:
            return _RuntimeFailingProvider(model=model)
        if provider == AIProvider.GEMINI:
            raise AIProviderConfigurationError(
                reason_code='gemini_api_key_missing',
                message='GEMINI_API_KEY is not configured',
            )
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OPENROUTER
    assert result.metadata.title == 'Fallback title'
    assert attempts == [AIProvider.OLLAMA, AIProvider.OPENROUTER]


@pytest.mark.asyncio
async def test_configuration_error_of_primary_does_not_fallback(monkeypatch):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        raise AIProviderConfigurationError(
            reason_code='gemini_api_key_missing',
            message='GEMINI_API_KEY is not configured',
        )

    with pytest.raises(AIProviderConfigurationError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.GEMINI,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    assert attempts == [AIProvider.GEMINI]


@pytest.mark.asyncio
async def test_configuration_error_of_fallback_provider_continues_chain(
    monkeypatch,
):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.GEMINI:
            return _RuntimeFailingProvider(model=model)
        if provider == AIProvider.OPENROUTER:
            raise AIProviderConfigurationError(
                reason_code='openrouter_api_key_missing',
                message='OPENROUTER_API_KEY is not configured',
            )
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OLLAMA
    assert result.metadata.title == 'Fallback title'
    assert attempts == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]


def test_primary_provider_configuration_validation_does_not_try_fallback(
    monkeypatch,
):
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        raise AIProviderConfigurationError(
            reason_code='openrouter_api_key_missing',
            message='OPENROUTER_API_KEY is not configured',
        )

    with pytest.raises(AIProviderConfigurationError):
        validate_primary_provider_configuration(
            AIProvider.OPENROUTER,
            provider_factory=provider_factory,
        )

    assert attempts == [AIProvider.OPENROUTER]


def test_mock_provider_has_no_fallback(monkeypatch):
    _set_added_providers(monkeypatch, {AIProvider.MOCK, AIProvider.GEMINI})

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.MOCK)
    ] == [AIProvider.MOCK]


@pytest.mark.asyncio
async def test_success_on_second_cycle_after_full_ring_failure(
    monkeypatch,
    clock,
):
    """Временный сбой всего кольца переживается повторным кругом."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if len(attempts) <= 3:
            return _RuntimeFailingProvider(model=model)
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OLLAMA
    assert attempts == [
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]
    # Между кругами был backoff.
    assert clock.value > 0.0


@pytest.mark.asyncio
async def test_permanent_failure_stops_at_cycle_limit(monkeypatch, clock):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        return _RuntimeFailingProvider(model=model)

    with pytest.raises(RuntimeError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    # Круги отработали до лимита; часть поздних попыток отсекается бюджетом,
    # когда таймаут провайдера уже не умещается в остаток.
    assert len(attempts) <= AI_FALLBACK_MAX_CYCLES * 3
    assert len(attempts) >= (AI_FALLBACK_MAX_CYCLES - 1) * 3


@pytest.mark.asyncio
async def test_config_error_excludes_provider_from_next_cycles(
    monkeypatch,
    clock,
):
    """Провайдер без ключа выбывает из кольца до конца обработки файла."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.GEMINI:
            raise AIProviderConfigurationError(
                reason_code='gemini_api_key_missing',
                message='GEMINI_API_KEY is not configured',
            )
        if len(attempts) < 4:
            return _RuntimeFailingProvider(model=model)
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OLLAMA
    # На втором круге Gemini уже не вызывается.
    assert attempts == [
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]


@pytest.mark.asyncio
async def test_rate_limited_provider_is_skipped_for_next_file(
    monkeypatch,
    clock,
):
    """429 ставит провайдера на общую паузу: следующий файл его пропускает."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if provider == AIProvider.GEMINI:
            return _RateLimitedProvider(model=model)
        return _SuccessfulProvider(model=model)

    first = await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('first.jpg'),
        provider_factory=provider_factory,
    )
    assert first.provider == AIProvider.OPENROUTER
    assert attempts == [AIProvider.GEMINI, AIProvider.OPENROUTER]

    attempts.clear()

    second = await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('second.jpg'),
        provider_factory=provider_factory,
    )

    assert second.provider == AIProvider.OPENROUTER
    assert attempts == [AIProvider.OPENROUTER]


@pytest.mark.asyncio
async def test_retry_after_header_is_respected_and_capped(
    monkeypatch,
    clock,
):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )

    def provider_factory(provider: AIProvider, model: str | None):
        if provider == AIProvider.GEMINI:
            return _RateLimitedProvider(model=model, retry_after='45')
        return _SuccessfulProvider(model=model)

    await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI) == 45.0

    provider_cooldown.reset_provider_cooldowns()

    def capped_factory(provider: AIProvider, model: str | None):
        if provider == AIProvider.GEMINI:
            return _RateLimitedProvider(model=model, retry_after='9999')
        return _SuccessfulProvider(model=model)

    await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('image.jpg'),
        provider_factory=capped_factory,
    )

    assert (
        provider_cooldown.get_cooldown_remaining(AIProvider.GEMINI)
        == PROVIDER_COOLDOWN_MAX_SECONDS
    )


@pytest.mark.asyncio
async def test_rate_limit_shrinks_capacity_and_next_file_records_it(
    monkeypatch,
    clock,
):
    """429 сужает адаптивную ёмкость провайдера."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )

    def provider_factory(provider: AIProvider, model: str | None):
        if provider == AIProvider.GEMINI:
            return _RateLimitedProvider(model=model)
        return _SuccessfulProvider(model=model)

    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 3

    await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    # 3.0 -> 1.5 -> floor 1 слот после одного 429.
    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 1


@pytest.mark.asyncio
async def test_throttle_skips_saturated_provider_for_alternative(
    monkeypatch,
    clock,
):
    """Слоты провайдера заняты, но он не под cooldown — берём альтернативу."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )

    # Сузим ёмкость GEMINI до 1 и займём единственный слот вручную —
    # cooldown при этом не ставим.
    provider_throttle.record_rate_limited(AIProvider.GEMINI)
    provider_throttle.record_rate_limited(AIProvider.GEMINI)
    assert provider_throttle.try_acquire(AIProvider.GEMINI) is True
    assert provider_throttle.get_available_capacity(AIProvider.GEMINI) == 0

    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.GEMINI,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    # GEMINI пропущен по занятой ёмкости, попытка ушла на следующего в кольце.
    assert result.provider == AIProvider.OPENROUTER
    assert attempts == [AIProvider.OPENROUTER]


@pytest.mark.asyncio
async def test_single_saturated_provider_waits_for_free_slot(monkeypatch):
    """Единственный провайдер с занятым слотом — файл ждёт освобождения."""
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})

    provider_throttle.record_rate_limited(AIProvider.OLLAMA)
    provider_throttle.record_rate_limited(AIProvider.OLLAMA)
    assert provider_throttle.try_acquire(AIProvider.OLLAMA) is True

    def provider_factory(provider: AIProvider, model: str | None):
        return _SuccessfulProvider(model=model)

    task = asyncio.create_task(
        generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )
    )
    await asyncio.sleep(0)
    # Слот занят — файл ждёт, задача не завершена.
    assert task.done() is False

    await provider_throttle.release(AIProvider.OLLAMA)
    result = await asyncio.wait_for(task, timeout=1.0)

    assert result.provider == AIProvider.OLLAMA
    # Слот, занятый на время попытки, освобождён.
    assert provider_throttle.get_available_capacity(AIProvider.OLLAMA) == 1


@pytest.mark.asyncio
async def test_slot_released_after_cancellation(monkeypatch, clock):
    """Отмена во время попытки освобождает занятый слот ёмкости."""
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )

    def provider_factory(provider: AIProvider, model: str | None):
        return _CancellingProvider(model=model)

    with pytest.raises(asyncio.CancelledError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    assert provider_throttle.get_available_capacity(AIProvider.OLLAMA) == 3


@pytest.mark.asyncio
async def test_single_provider_waits_out_rate_limit_and_succeeds(
    monkeypatch,
    clock,
):
    """При единственном провайдере файл ждёт снятия лимита, а не падает."""
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        if len(attempts) == 1:
            return _RateLimitedProvider(model=model, retry_after='20')
        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider == AIProvider.OLLAMA
    assert attempts == [AIProvider.OLLAMA, AIProvider.OLLAMA]
    # Дождались снятия лимита, а не проскочили его.
    assert clock.value >= 20.0


@pytest.mark.asyncio
async def test_budget_stops_retries_before_cycle_limit(monkeypatch, clock):
    """Бюджет времени обрывает повторы, даже если круги не исчерпаны."""
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        return _RateLimitedProvider(
            model=model,
            retry_after=str(PROVIDER_COOLDOWN_MAX_SECONDS),
        )

    with pytest.raises(httpx.HTTPStatusError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    assert len(attempts) < AI_FALLBACK_MAX_CYCLES
    assert clock.value <= AI_FALLBACK_BUDGET_SECONDS


def test_local_provider_timeout_is_longer_than_cloud():
    """Локальной модели дано заметно больше времени, чем облачным."""
    ollama_timeout = get_provider_timeout(AIProvider.OLLAMA)

    assert ollama_timeout > get_provider_timeout(AIProvider.GEMINI)
    assert ollama_timeout > get_provider_timeout(AIProvider.OPENROUTER)
    # После полного таймаута локальной модели в бюджете обязан остаться
    # запас хотя бы на один облачный заход.
    assert (
        ollama_timeout + get_provider_timeout(AIProvider.GEMINI)
        < AI_FALLBACK_BUDGET_SECONDS
    )


@pytest.mark.asyncio
async def test_timeout_penalizes_provider_and_waits_for_cloud(
    monkeypatch,
    clock,
):
    """
    Регрессия: Ollama таймаутит, облачные под cooldown после 429 — файл
    обязан дождаться облачного провайдера, а не заходить в локальную модель
    второй раз и падать по исчерпанному бюджету.
    """
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)

        if provider == AIProvider.OLLAMA:
            return _TimingOutProvider(
                model=model,
                clock=clock,
                timeout=get_provider_timeout(AIProvider.OLLAMA),
            )

        if attempts.count(provider) == 1:
            return _RateLimitedProvider(model=model, retry_after='30')

        return _SuccessfulProvider(model=model)

    result = await generate_metadata_with_fallback(
        selected_provider=AIProvider.OLLAMA,
        image_path=Path('image.jpg'),
        provider_factory=provider_factory,
    )

    assert result.provider in {AIProvider.GEMINI, AIProvider.OPENROUTER}
    # В локальную модель зашли ровно один раз: после таймаута она остывает.
    assert attempts.count(AIProvider.OLLAMA) == 1
    assert clock.value <= AI_FALLBACK_BUDGET_SECONDS


@pytest.mark.asyncio
async def test_attempt_is_skipped_when_timeout_exceeds_budget(
    monkeypatch,
    clock,
):
    """Провайдер, чей таймаут не влезает в остаток бюджета, не запускается."""
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        return _TimingOutProvider(
            model=model,
            clock=clock,
            timeout=get_provider_timeout(AIProvider.OLLAMA),
        )

    with pytest.raises(httpx.ReadTimeout):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    # Второй заход не влезал в бюджет, поэтому его не начинали.
    assert attempts == [AIProvider.OLLAMA]
    assert clock.value <= AI_FALLBACK_BUDGET_SECONDS


@pytest.mark.asyncio
async def test_ring_emptied_by_config_errors_stops_retrying(
    monkeypatch,
    clock,
):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        # Первичный Ollama на первом круге падает временной ошибкой,
        # на втором — уже ошибкой конфигурации и выбывает из кольца.
        if provider == AIProvider.OLLAMA and len(attempts) == 1:
            return _RuntimeFailingProvider(model=model)
        raise AIProviderConfigurationError(
            reason_code='provider_api_key_missing',
            message='API key is not configured',
        )

    with pytest.raises(AIProviderConfigurationError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    assert attempts == [
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]


@pytest.mark.asyncio
async def test_cancellation_during_attempt_aborts_fallback(
    monkeypatch,
    clock,
):
    _set_added_providers(
        monkeypatch,
        {AIProvider.OLLAMA, AIProvider.GEMINI, AIProvider.OPENROUTER},
    )
    attempts: list[AIProvider] = []

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        return _CancellingProvider(model=model)

    with pytest.raises(asyncio.CancelledError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    assert attempts == [AIProvider.OLLAMA]


@pytest.mark.asyncio
async def test_cancellation_during_backoff_aborts_fallback(
    monkeypatch,
    clock,
):
    _set_added_providers(monkeypatch, {AIProvider.OLLAMA})
    attempts: list[AIProvider] = []

    async def cancelling_sleep(_delay: float) -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(ai_fallback, '_sleep', cancelling_sleep)

    def provider_factory(provider: AIProvider, model: str | None):
        attempts.append(provider)
        return _RuntimeFailingProvider(model=model)

    with pytest.raises(asyncio.CancelledError):
        await generate_metadata_with_fallback(
            selected_provider=AIProvider.OLLAMA,
            image_path=Path('image.jpg'),
            provider_factory=provider_factory,
        )

    # Отмена прервала ожидание перед вторым кругом.
    assert attempts == [AIProvider.OLLAMA]


def test_fallback_chain_excludes_unavailable_local_provider(monkeypatch):
    """Регрессия: выключенная Ollama не должна попадать в fallback-кольцо."""
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: 'stored-api-key',
    )
    monkeypatch.setattr(
        ai_fallback,
        'is_local_provider_available',
        lambda: False,
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ]


def test_selected_local_provider_stays_in_chain_when_unavailable(monkeypatch):
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: None,
    )
    monkeypatch.setattr(
        ai_fallback,
        'is_local_provider_available',
        lambda: False,
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OLLAMA)
    ] == [AIProvider.OLLAMA]


def test_available_local_provider_keeps_previous_behaviour(monkeypatch):
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: 'stored-api-key',
    )
    monkeypatch.setattr(
        ai_fallback,
        'is_local_provider_available',
        lambda: True,
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ]


def test_fallback_chain_excludes_providers_disabled_in_ai_setup(monkeypatch):
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: 'stored-api-key',
    )
    monkeypatch.setattr(
        ai_fallback,
        'is_local_provider_available',
        lambda: True,
    )
    monkeypatch.setattr(
        ai_fallback,
        'get_disabled_providers',
        lambda: {AIProvider.OLLAMA},
    )

    assert ai_fallback.is_provider_added(AIProvider.OLLAMA) is False
    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.GEMINI)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ]


def test_disabled_selected_provider_leaves_chain(monkeypatch):
    monkeypatch.setattr(
        ai_fallback,
        'get_ai_provider_api_key',
        lambda provider: 'stored-api-key',
    )
    monkeypatch.setattr(
        ai_fallback,
        'is_local_provider_available',
        lambda: True,
    )
    monkeypatch.setattr(
        ai_fallback,
        'get_disabled_providers',
        lambda: {AIProvider.OLLAMA},
    )

    assert [
        attempt.provider
        for attempt in build_provider_fallback_chain(AIProvider.OLLAMA)
    ] == [
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ]
