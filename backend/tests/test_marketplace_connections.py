from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.runtime import reset_runtime_directories_cache
from app.main import app


def test_marketplace_credentials_can_be_saved_and_hidden(
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    reset_runtime_directories_cache()

    try:
        with TestClient(app) as client:
            response = client.put(
                '/api/v1/marketplaces/shutterstock/credentials',
                json={
                    'api_key': 'shutterstock-secret-123',
                    'account_id': 'seller-1',
                },
            )

            assert response.status_code == 200
            payload = response.json()
            connection = payload['connection']
            assert connection['marketplace'] == 'shutterstock'
            assert connection['status'] == 'connected'
            assert connection['connected'] is True
            assert connection['account_id'] == 'seller-1'
            assert connection['credential_type'] == 'api_key'
            assert connection['secret_hint'] == '***-123'
            assert 'shutterstock-secret-123' not in response.text

            state_response = client.get(
                '/api/v1/marketplaces/shutterstock/connection'
            )
            assert state_response.status_code == 200
            assert 'shutterstock-secret-123' not in state_response.text
            assert state_response.json()['status'] == 'connected'

            stored_payload = (
                tmp_path / 'marketplace_credentials.json'
            ).read_text(encoding='utf-8')
            assert 'shutterstock-secret-123' in stored_payload
    finally:
        reset_runtime_directories_cache()


def test_marketplace_invalid_credentials_return_normalized_error(
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    reset_runtime_directories_cache()

    try:
        with TestClient(app) as client:
            validate_response = client.post(
                '/api/v1/marketplaces/adobe_stock/validate',
                json={'token': 'bad'},
            )
            assert validate_response.status_code == 200
            validate_payload = validate_response.json()
            assert validate_payload['valid'] is False
            assert validate_payload['status'] == 'error'
            assert validate_payload['error'] == {
                'code': 'credential_too_short',
                'message': 'Credential value is too short.',
            }
            assert 'bad' not in validate_response.text

            save_response = client.put(
                '/api/v1/marketplaces/adobe_stock/credentials',
                json={'token': 'invalid-token-value'},
            )
            assert save_response.status_code == 400
            assert save_response.json()['detail']['error'] == {
                'code': 'credential_rejected',
                'message': (
                    'Marketplace rejected the provided credentials.'
                ),
            }
            assert 'invalid-token-value' not in save_response.text

            state_response = client.get(
                '/api/v1/marketplaces/adobe_stock/connection'
            )
            assert state_response.status_code == 200
            state_payload = state_response.json()
            assert state_payload['status'] == 'error'
            assert state_payload['connected'] is False
            assert state_payload['secret_hint'] is None

            stored_payload = (
                tmp_path / 'marketplace_credentials.json'
            ).read_text(encoding='utf-8')
            assert 'invalid-token-value' not in stored_payload
    finally:
        reset_runtime_directories_cache()


def test_invalid_marketplace_update_preserves_existing_credentials(
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    reset_runtime_directories_cache()

    try:
        with TestClient(app) as client:
            save_response = client.put(
                '/api/v1/marketplaces/shutterstock/credentials',
                json={
                    'api_key': 'shutterstock-secret-123',
                    'account_id': 'seller-1',
                },
            )
            assert save_response.status_code == 200

            invalid_update_response = client.put(
                '/api/v1/marketplaces/shutterstock/credentials',
                json={
                    'api_key': 'invalid-token-value',
                    'account_id': 'seller-2',
                },
            )
            assert invalid_update_response.status_code == 400
            assert invalid_update_response.json()['detail']['error'] == {
                'code': 'credential_rejected',
                'message': 'Marketplace rejected the provided credentials.',
            }
            assert 'invalid-token-value' not in invalid_update_response.text

            state_response = client.get(
                '/api/v1/marketplaces/shutterstock/connection'
            )
            assert state_response.status_code == 200
            state_payload = state_response.json()
            assert state_payload['status'] == 'connected'
            assert state_payload['connected'] is True
            assert state_payload['account_id'] == 'seller-1'
            assert state_payload['secret_hint'] == '***-123'

            stored_payload = (
                tmp_path / 'marketplace_credentials.json'
            ).read_text(encoding='utf-8')
            assert 'shutterstock-secret-123' in stored_payload
            assert 'invalid-token-value' not in stored_payload
            assert 'seller-2' not in stored_payload
    finally:
        reset_runtime_directories_cache()


def test_marketplace_credentials_can_be_deleted(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    reset_runtime_directories_cache()

    try:
        with TestClient(app) as client:
            save_response = client.put(
                '/api/v1/marketplaces/getty_images/credentials',
                json={'api_key': 'getty-secret-123'},
            )
            assert save_response.status_code == 200

            delete_response = client.delete(
                '/api/v1/marketplaces/getty_images/credentials'
            )
            assert delete_response.status_code == 200
            assert delete_response.json()['status'] == 'disconnected'

            state_response = client.get(
                '/api/v1/marketplaces/getty_images/connection'
            )
            assert state_response.status_code == 200
            assert state_response.json()['connected'] is False
    finally:
        reset_runtime_directories_cache()
