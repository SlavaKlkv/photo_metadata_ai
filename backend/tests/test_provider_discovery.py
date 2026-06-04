import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.desktop.desktop_startup import desktop_startup_orchestrator


@pytest.fixture(autouse=True)
def reset_provider_settings(monkeypatch):
    desktop_startup_orchestrator.reset_for_tests()
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', None)
    monkeypatch.setattr(settings, 'OPENROUTER_API_KEY', None)
    monkeypatch.setattr(settings, 'OPENROUTER_MODEL', 'openrouter/auto')
    monkeypatch.setattr(settings, 'OLLAMA_REQUIRED_MODEL', 'qwen2.5vl')
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', 'http://ollama.test')
    monkeypatch.setattr(
        settings, 'DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS', 1
    )
    monkeypatch.setattr(settings, 'DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS', 1)
    monkeypatch.setattr(
        settings,
        'DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS',
        0,
    )
    yield
    desktop_startup_orchestrator.reset_for_tests()


def test_provider_discovery_reports_unavailable_ollama(monkeypatch):
    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'ollama.test':
            raise httpx.ConnectError('connection refused')

        return httpx.Response(200, json={})

    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    ollama_provider = _provider_by_name(payload, 'ollama')

    assert ollama_provider['ready'] is False
    assert ollama_provider['reason_code'] == 'ollama_runtime_unavailable'
    assert payload['has_ready_provider'] is False


def test_provider_discovery_reports_ready_ollama(monkeypatch):
    async_client = httpx.AsyncClient

    async def request_handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                'models': [
                    {
                        'name': 'qwen2.5vl:latest',
                        'model': 'qwen2.5vl:latest',
                    }
                ]
            },
        )

    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    ollama_provider = _provider_by_name(payload, 'ollama')

    assert ollama_provider['ready'] is True
    assert ollama_provider['status'] == 'ready'
    assert ollama_provider['reason_code'] is None
    assert payload['recommended_provider'] == 'ollama'
    assert payload['has_ready_provider'] is True


def test_provider_discovery_reports_cloud_configuration_without_secrets(
    monkeypatch,
):
    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'ollama.test':
            raise httpx.ConnectError('connection refused')

        return httpx.Response(200, json={})

    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'secret-gemini-key')
    monkeypatch.setattr(settings, 'OPENROUTER_API_KEY', 'secret-router-key')
    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    gemini_provider = _provider_by_name(payload, 'gemini')
    openrouter_provider = _provider_by_name(payload, 'openrouter')
    response_text = response.text

    assert gemini_provider['ready'] is True
    assert openrouter_provider['ready'] is True
    assert openrouter_provider['model'] == 'openrouter/auto'
    assert payload['recommended_provider'] == 'gemini'
    assert payload['has_detected_cloud_api_key'] is True
    assert payload['detected_cloud_api_key_providers'] == [
        'gemini',
        'openrouter',
    ]
    assert 'secret-gemini-key' not in response_text
    assert 'secret-router-key' not in response_text


def test_provider_discovery_returns_read_only_prefill_state_for_found_key(
    monkeypatch,
):
    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'ollama.test':
            raise httpx.ConnectError('connection refused')

        return httpx.Response(200, json={})

    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'secret-gemini-key')
    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    gemini_provider = _provider_by_name(payload, 'gemini')
    onboarding = gemini_provider['onboarding']
    prefill = onboarding['prefill']
    validation = onboarding['validation']

    assert onboarding['api_key_detected'] is True
    assert onboarding['notify_detected_api_key'] is True
    assert onboarding['recommendation'] == (
        'Use the detected Gemini API key from GEMINI_API_KEY.'
    )
    assert onboarding['input_mode'] == 'prefill_read_only'
    assert onboarding['manual_input_required'] is False
    assert prefill['available'] is True
    assert prefill['env_var'] == 'GEMINI_API_KEY'
    assert prefill['display_value'] == 'Configured GEMINI_API_KEY'
    assert prefill['read_only'] is True
    assert prefill['editable'] is False
    assert prefill['reset_required_to_edit'] is True
    assert validation['required'] is True
    assert validation['trigger'] == 'automatic'
    assert validation['status'] == 'valid'
    assert 'secret-gemini-key' not in response.text


def test_provider_discovery_returns_manual_key_state_when_found_key_invalid(
    monkeypatch,
):
    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'ollama.test':
            raise httpx.ConnectError('connection refused')

        return httpx.Response(401, json={'error': 'invalid key'})

    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'invalid-gemini-key')
    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    gemini_provider = _provider_by_name(payload, 'gemini')
    onboarding = gemini_provider['onboarding']
    prefill = onboarding['prefill']
    validation = onboarding['validation']

    assert gemini_provider['ready'] is False
    assert gemini_provider['reason_code'] == 'gemini_api_key_invalid'
    assert onboarding['api_key_detected'] is True
    assert onboarding['notify_detected_api_key'] is True
    assert onboarding['input_mode'] == 'manual'
    assert onboarding['manual_input_required'] is True
    assert prefill['available'] is False
    assert prefill['editable'] is True
    assert validation['trigger'] == 'automatic'
    assert validation['status'] == 'invalid'
    assert validation['error_message'] == 'invalid key'
    assert 'invalid-gemini-key' not in response.text


def test_provider_discovery_validates_openrouter_key_via_key_endpoint(
    monkeypatch,
):
    async_client = httpx.AsyncClient
    requested_paths: list[str] = []

    async def request_handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'ollama.test':
            raise httpx.ConnectError('connection refused')

        requested_paths.append(request.url.path)
        return httpx.Response(200, json={'data': {'limit': 100}})

    monkeypatch.setattr(settings, 'OPENROUTER_API_KEY', 'valid-router-key')
    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    openrouter_provider = _provider_by_name(payload, 'openrouter')
    validation = openrouter_provider['onboarding']['validation']

    assert requested_paths
    assert set(requested_paths) == {'/api/v1/key'}
    assert openrouter_provider['ready'] is True
    assert validation['trigger'] == 'automatic'
    assert validation['status'] == 'valid'
    assert 'valid-router-key' not in response.text


def test_provider_discovery_rejects_invalid_openrouter_key(
    monkeypatch,
):
    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'ollama.test':
            raise httpx.ConnectError('connection refused')

        return httpx.Response(401, json={'error': 'invalid key'})

    monkeypatch.setattr(settings, 'OPENROUTER_API_KEY', 'invalid-router-key')
    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    openrouter_provider = _provider_by_name(payload, 'openrouter')
    onboarding = openrouter_provider['onboarding']
    validation = onboarding['validation']

    assert openrouter_provider['ready'] is False
    assert openrouter_provider['reason_code'] == 'openrouter_api_key_invalid'
    assert onboarding['input_mode'] == 'manual'
    assert onboarding['manual_input_required'] is True
    assert validation['trigger'] == 'automatic'
    assert validation['status'] == 'invalid'
    assert validation['error_message'] == 'invalid key'
    assert 'invalid-router-key' not in response.text


def test_provider_discovery_returns_manual_key_state_when_key_missing(
    monkeypatch,
):
    async_client = httpx.AsyncClient

    async def request_handler(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('connection refused')

    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/providers/discovery')

    assert response.status_code == 200
    payload = response.json()
    gemini_provider = _provider_by_name(payload, 'gemini')
    onboarding = gemini_provider['onboarding']
    prefill = onboarding['prefill']
    validation = onboarding['validation']

    assert payload['has_detected_cloud_api_key'] is False
    assert payload['detected_cloud_api_key_providers'] == []
    assert onboarding['api_key_detected'] is False
    assert onboarding['notify_detected_api_key'] is False
    assert onboarding['input_mode'] == 'manual'
    assert onboarding['manual_input_required'] is True
    assert prefill['available'] is False
    assert prefill['read_only'] is False
    assert prefill['editable'] is True
    assert validation['required'] is True
    assert validation['trigger'] == 'manual'
    assert validation['status'] == 'missing'
    assert validation['error_message'] == 'invalid key'


def _provider_by_name(payload: dict, provider_name: str) -> dict:
    return next(
        provider
        for provider in payload['providers']
        if provider['provider'] == provider_name
    )
