import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.desktop import ai_provider_api_keys


@pytest.mark.parametrize('provider', ['gemini', 'openrouter'])
def test_non_ascii_api_key_returns_invalid_result_without_external_request(
    monkeypatch,
    provider: str,
):
    class UnexpectedAsyncClient:
        def __init__(self, **kwargs):
            raise AssertionError('External validation must not run')

    monkeypatch.setattr(
        ai_provider_api_keys.httpx,
        'AsyncClient',
        UnexpectedAsyncClient,
    )

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/ai-providers/{provider}/api-key/validate-and-save',
            json={'api_key': 'невалидный-ключ'},
        )

    assert response.status_code == 200
    assert response.json() == {
        'provider': provider,
        'valid': False,
        'status': 'invalid',
        'reason_code': f'{provider}_api_key_invalid',
        'message': 'Invalid API key',
        'saved': False,
    }
