from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.desktop import app_updates

UPDATES_URL = '/api/v1/desktop/updates'


@pytest.fixture(autouse=True)
def reset_updates_cache():
    app_updates.reset_updates_cache_for_tests()
    yield
    app_updates.reset_updates_cache_for_tests()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _release_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'tag_name': 'v1.1.0',
        'html_url': (
            'https://github.com/SlavaKlkv/photo_metadata_ai'
            '/releases/tag/v1.1.0'
        ),
        'assets': [
            {
                'name': 'Photo-Metadata-AI-1.1.0-universal.dmg',
                'browser_download_url': (
                    'https://github.com/SlavaKlkv/photo_metadata_ai'
                    '/releases/download/v1.1.0'
                    '/Photo-Metadata-AI-1.1.0-universal.dmg'
                ),
            },
        ],
    }
    payload.update(overrides)
    return payload


def _mock_fetch(monkeypatch, payload: dict[str, Any]):
    calls = {'count': 0}

    async def fake_fetch() -> dict[str, Any]:
        calls['count'] += 1
        return payload

    monkeypatch.setattr(app_updates, '_fetch_latest_release', fake_fetch)
    return calls


def test_updates_reports_newer_release(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    _mock_fetch(monkeypatch, _release_payload())

    response = client.get(UPDATES_URL)

    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['update_available'] is True
    assert body['current_version'] == '1.0.0'
    assert body['latest_version'] == '1.1.0'
    assert body['release_url'].endswith('/releases/tag/v1.1.0')
    assert body['download_url'].endswith('.dmg')


def test_updates_same_version_is_not_available(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.1.0')
    _mock_fetch(monkeypatch, _release_payload())

    body = client.get(UPDATES_URL).json()

    assert body['status'] == 'ok'
    assert body['update_available'] is False


def test_updates_release_without_dmg_asset(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    _mock_fetch(monkeypatch, _release_payload(assets=[]))

    body = client.get(UPDATES_URL).json()

    assert body['status'] == 'ok'
    assert body['update_available'] is True
    assert body['download_url'] is None
    assert body['release_url'] is not None


def test_updates_malformed_tag_is_not_available(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    _mock_fetch(monkeypatch, _release_payload(tag_name='latest'))

    body = client.get(UPDATES_URL).json()

    assert body['status'] == 'ok'
    assert body['update_available'] is False
    assert body['latest_version'] is None


def test_updates_without_published_release_reports_current_version(
    client,
    monkeypatch,
):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    request = httpx.Request('GET', settings.UPDATES_GITHUB_LATEST_RELEASE_URL)

    async def missing_release() -> dict[str, Any]:
        raise httpx.HTTPStatusError(
            'no published release',
            request=request,
            response=httpx.Response(404, request=request),
        )

    monkeypatch.setattr(
        app_updates,
        '_fetch_latest_release',
        missing_release,
    )

    body = client.get(UPDATES_URL).json()

    assert body == {
        'status': 'ok',
        'update_available': False,
        'current_version': '1.0.0',
        'latest_version': None,
        'release_url': None,
        'download_url': None,
    }


@pytest.mark.parametrize(
    'error',
    [
        httpx.ConnectError('offline'),
        httpx.HTTPStatusError(
            'rate limited',
            request=httpx.Request('GET', 'https://api.github.com'),
            response=httpx.Response(
                403,
                request=httpx.Request('GET', 'https://api.github.com'),
            ),
        ),
        ValueError('unexpected_release_payload'),
    ],
)
def test_updates_degrades_silently_on_errors(client, monkeypatch, error):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')

    async def failing_fetch() -> dict[str, Any]:
        raise error

    monkeypatch.setattr(app_updates, '_fetch_latest_release', failing_fetch)

    response = client.get(UPDATES_URL)

    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'unavailable'
    assert body['update_available'] is False
    assert body['current_version'] == '1.0.0'


def test_updates_disabled_without_app_version(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', None)

    async def unexpected_fetch() -> dict[str, Any]:
        raise AssertionError('GitHub must not be called when disabled')

    monkeypatch.setattr(app_updates, '_fetch_latest_release', unexpected_fetch)

    body = client.get(UPDATES_URL).json()

    assert body['status'] == 'disabled'
    assert body['update_available'] is False


def test_updates_successful_response_is_cached(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    calls = _mock_fetch(monkeypatch, _release_payload())

    first = client.get(UPDATES_URL).json()
    second = client.get(UPDATES_URL).json()

    assert first == second
    assert calls['count'] == 1


def test_manual_update_check_bypasses_cached_response(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    calls = _mock_fetch(monkeypatch, _release_payload())

    cached = client.get(UPDATES_URL).json()
    refreshed = client.get(UPDATES_URL, params={'force': 'true'}).json()

    assert cached == refreshed
    assert calls['count'] == 2


def test_updates_error_response_is_not_cached(client, monkeypatch):
    monkeypatch.setattr(settings, 'DESKTOP_APP_VERSION', '1.0.0')
    calls = {'count': 0}

    async def flaky_fetch() -> dict[str, Any]:
        calls['count'] += 1
        raise httpx.ConnectError('offline')

    monkeypatch.setattr(app_updates, '_fetch_latest_release', flaky_fetch)

    client.get(UPDATES_URL)
    client.get(UPDATES_URL)

    assert calls['count'] == 2
