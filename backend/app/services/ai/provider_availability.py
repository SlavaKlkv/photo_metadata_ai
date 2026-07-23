"""
Снимок доступности локального провайдера (Ollama) для fallback-кольца.

`is_provider_added` и `build_provider_fallback_chain` синхронные, а discovery
локального рантайма — async и ходит по сети. Поэтому доступность снимается один
раз на job и кладётся в кэш с TTL, а кольцо читает уже готовый снимок.
"""

import time

import structlog

logger = structlog.get_logger(__name__)

LOCAL_PROVIDER_AVAILABILITY_TTL_SECONDS = 30.0

_available: bool | None = None
_checked_at: float | None = None


def _now() -> float:
    return time.monotonic()


async def refresh_local_provider_availability(
    *,
    force: bool = False,
) -> bool:
    """
    Обновляет снимок доступности Ollama. В пределах TTL повторный пинг не
    выполняется, если не передан `force`.
    """
    global _available, _checked_at

    if (
        not force
        and _available is not None
        and _checked_at is not None
        and _now() - _checked_at < LOCAL_PROVIDER_AVAILABILITY_TTL_SECONDS
    ):
        return _available

    from app.services.provider_discovery.provider_discovery import (
        _discover_ollama_provider,
    )

    try:
        discovery = await _discover_ollama_provider()
        available = discovery.ready
    except Exception as error:  # noqa: BLE001 — снимок не должен ронять job
        logger.warning(
            'local_provider_availability_refresh_failed',
            error=str(error),
        )
        available = False

    _available = available
    _checked_at = _now()

    logger.info(
        'local_provider_availability_refreshed',
        available=available,
    )
    return available


def is_local_provider_available() -> bool:
    """
    Доступность локального провайдера по последнему снимку. Пустой или
    протухший кэш трактуется как «доступен», чтобы не выбить явно выбранный
    провайдер до первого refresh.
    """
    if _available is None or _checked_at is None:
        return True

    if _now() - _checked_at >= LOCAL_PROVIDER_AVAILABILITY_TTL_SECONDS:
        return True

    return _available


def reset_local_provider_availability() -> None:
    """Сброс снимка. Нужен тестам и смене конфигурации провайдера."""
    global _available, _checked_at
    _available = None
    _checked_at = None
