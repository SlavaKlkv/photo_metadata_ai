import re
import time
from typing import Any

import httpx
import structlog

from app.core.config import settings
from app.schemas.desktop import DesktopUpdateCheckResponse

logger = structlog.get_logger(__name__)

_VERSION_RE = re.compile(r'^v?(\d+)\.(\d+)\.(\d+)$')
_CACHE_TTL_SECONDS = 3600.0

_cached_response: DesktopUpdateCheckResponse | None = None
_cached_at: float | None = None


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = _VERSION_RE.match(value.strip())
    if match is None:
        return None

    major, minor, patch = (int(part) for part in match.groups())
    return (major, minor, patch)


def is_newer_version(latest: str, current: str) -> bool:
    latest_parts = parse_version(latest)
    current_parts = parse_version(current)

    if latest_parts is None or current_parts is None:
        return False

    return latest_parts > current_parts


async def check_for_updates(
    *,
    force_refresh: bool = False,
) -> DesktopUpdateCheckResponse:
    global _cached_response, _cached_at

    current_version = settings.DESKTOP_APP_VERSION
    if not current_version:
        return DesktopUpdateCheckResponse(
            status='disabled',
            update_available=False,
        )

    now = time.monotonic()
    if (
        not force_refresh
        and _cached_response is not None
        and _cached_at is not None
        and now - _cached_at < _CACHE_TTL_SECONDS
    ):
        return _cached_response

    try:
        release = await _fetch_latest_release()
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 404:
            # Публичный репозиторий без опубликованных releases отвечает
            # 404 на /releases/latest. Это штатное состояние: обновлений
            # пока нет, а не ошибка сети или GitHub.
            response = DesktopUpdateCheckResponse(
                status='ok',
                update_available=False,
                current_version=current_version,
            )
            _cached_response = response
            _cached_at = now
            return response

        logger.warning('app_updates_check_failed', error=str(error))
        return DesktopUpdateCheckResponse(
            status='unavailable',
            update_available=False,
            current_version=current_version,
        )
    except (httpx.HTTPError, ValueError) as error:
        # Оффлайн, rate-limit или битый ответ — тихо деградируем,
        # проверка обновлений не должна мешать работе приложения.
        logger.warning('app_updates_check_failed', error=str(error))
        return DesktopUpdateCheckResponse(
            status='unavailable',
            update_available=False,
            current_version=current_version,
        )

    tag = str(release.get('tag_name') or '').strip()
    latest_version = tag.lstrip('v') if parse_version(tag) else None

    response = DesktopUpdateCheckResponse(
        status='ok',
        update_available=(
            latest_version is not None
            and is_newer_version(latest_version, current_version)
        ),
        current_version=current_version,
        latest_version=latest_version,
        release_url=release.get('html_url'),
        download_url=_pick_dmg_url(release),
    )
    _cached_response = response
    _cached_at = now
    return response


def reset_updates_cache_for_tests() -> None:
    global _cached_response, _cached_at
    _cached_response = None
    _cached_at = None


async def _fetch_latest_release() -> dict[str, Any]:
    async with httpx.AsyncClient(
        timeout=settings.UPDATES_CHECK_TIMEOUT_SECONDS,
        headers={'Accept': 'application/vnd.github+json'},
    ) as client:
        response = await client.get(settings.UPDATES_GITHUB_LATEST_RELEASE_URL)
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, dict):
        raise ValueError('unexpected_release_payload')

    return payload


def _pick_dmg_url(release: dict[str, Any]) -> str | None:
    for asset in release.get('assets') or []:
        if not isinstance(asset, dict):
            continue
        name = str(asset.get('name') or '')
        if name.endswith('.dmg'):
            return asset.get('browser_download_url')

    return None
