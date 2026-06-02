from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.runtime import reset_runtime_directories_cache
from app.main import app
from app.services.app_settings import get_desktop_settings


def test_desktop_settings_persist_selected_provider(
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    monkeypatch.setattr(settings, 'DEFAULT_AI_PROVIDER', 'ollama')
    monkeypatch.setattr(settings, 'OPENROUTER_MODEL', 'openrouter/auto')
    reset_runtime_directories_cache()

    try:
        with TestClient(app) as client:
            response = client.patch(
                '/api/v1/desktop/settings',
                json={'selected_provider': 'openrouter'},
            )
            assert response.status_code == 200
            assert response.json() == {
                'selected_provider': 'openrouter',
                'effective_provider': 'openrouter',
                'effective_model': 'openrouter/auto',
            }

            restored_response = client.get('/api/v1/desktop/settings')
            assert restored_response.status_code == 200
            assert restored_response.json()['selected_provider'] == (
                'openrouter'
            )
            assert restored_response.json()['effective_model'] == (
                'openrouter/auto'
            )

        assert get_desktop_settings().selected_provider == 'openrouter'
    finally:
        reset_runtime_directories_cache()


def test_desktop_settings_reject_invalid_provider():
    with TestClient(app) as client:
        response = client.patch(
            '/api/v1/desktop/settings',
            json={'selected_provider': 'invalid-provider'},
        )

    assert response.status_code == 422


def test_job_settings_reject_invalid_provider():
    with TestClient(app) as client:
        create_response = client.post('/api/v1/internal/', json={'files': []})
        assert create_response.status_code == 200
        job_id = create_response.json()['job_id']

        response = client.patch(
            f'/api/v1/jobs/{job_id}/settings',
            json={'ai_provider': 'invalid-provider'},
        )

    assert response.status_code == 422


def test_job_settings_returns_effective_provider_and_model(
    monkeypatch,
):
    monkeypatch.setattr(settings, 'OPENROUTER_MODEL', 'openrouter/auto')

    with TestClient(app) as client:
        create_response = client.post('/api/v1/internal/', json={'files': []})
        assert create_response.status_code == 200
        job_id = create_response.json()['job_id']

        response = client.patch(
            f'/api/v1/jobs/{job_id}/settings',
            json={'ai_provider': 'openrouter'},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['ai_provider'] == 'openrouter'
    assert payload['effective_ai_provider'] == 'openrouter'
    assert payload['effective_ai_model'] == 'openrouter/auto'
