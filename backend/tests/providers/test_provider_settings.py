from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.enums import AIProvider
from app.core.runtime import reset_runtime_directories_cache
from app.main import app
from app.services.desktop.app_settings import (
    get_desktop_settings,
    get_disabled_providers,
)


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
                'disabled_providers': [],
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


def _isolated_workspace(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    monkeypatch.setattr(settings, 'DEFAULT_AI_PROVIDER', 'ollama')
    reset_runtime_directories_cache()


def test_disabled_providers_persist_and_survive_provider_change(
    monkeypatch,
    tmp_path: Path,
):
    _isolated_workspace(monkeypatch, tmp_path)

    try:
        with TestClient(app) as client:
            response = client.patch(
                '/api/v1/desktop/settings',
                json={'disabled_providers': ['openrouter']},
            )
            assert response.status_code == 200
            assert response.json()['disabled_providers'] == ['openrouter']

            # Смена провайдера не должна сбрасывать список отключённых.
            changed = client.patch(
                '/api/v1/desktop/settings',
                json={'selected_provider': 'gemini'},
            )
            assert changed.json()['disabled_providers'] == ['openrouter']

            restored = client.get('/api/v1/desktop/settings')
            assert restored.json()['disabled_providers'] == ['openrouter']

        assert get_disabled_providers() == {AIProvider.OPENROUTER}
    finally:
        reset_runtime_directories_cache()


def test_disabled_provider_stays_disabled_even_if_selected(
    monkeypatch,
    tmp_path: Path,
):
    """Регрессия: выключенный локальный провайдер включался обратно."""
    _isolated_workspace(monkeypatch, tmp_path)

    try:
        with TestClient(app) as client:
            client.patch(
                '/api/v1/desktop/settings',
                json={'selected_provider': 'ollama'},
            )
            client.patch(
                '/api/v1/desktop/settings',
                json={'disabled_providers': ['ollama']},
            )
            restored = client.get('/api/v1/desktop/settings')

            assert restored.json()['disabled_providers'] == ['ollama']
            # Выбор ушёл дальше по кольцу fallback.
            assert restored.json()['selected_provider'] == 'gemini'
    finally:
        reset_runtime_directories_cache()


def test_desktop_settings_reject_invalid_disabled_provider():
    with TestClient(app) as client:
        response = client.patch(
            '/api/v1/desktop/settings',
            json={'disabled_providers': ['invalid-provider']},
        )

    assert response.status_code == 422


def test_disabling_every_provider_keeps_selection(monkeypatch, tmp_path: Path):
    _isolated_workspace(monkeypatch, tmp_path)

    try:
        with TestClient(app) as client:
            response = client.patch(
                '/api/v1/desktop/settings',
                json={
                    'selected_provider': 'gemini',
                    'disabled_providers': ['ollama', 'gemini', 'openrouter'],
                },
            )

            assert response.json()['selected_provider'] == 'gemini'
    finally:
        reset_runtime_directories_cache()
