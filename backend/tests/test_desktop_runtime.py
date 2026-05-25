import time
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings, settings
from app.core.constants import RESULTS_DIR
from app.core.runtime import resolve_path_in_base
from app.main import app


def _build_tiny_jpeg_bytes() -> bytes:
    buffer = BytesIO()
    Image.new('RGB', (1, 1), color='white').save(buffer, format='JPEG')
    return buffer.getvalue()


def _wait_for_job_status(
    client: TestClient,
    job_id: str,
    expected_status: str,
    max_attempts: int = 20,
) -> dict[str, Any]:
    last_payload: dict[str, Any] = {}

    for _ in range(max_attempts):
        response = client.get(f'/api/v1/jobs/{job_id}/status')
        assert response.status_code == 200

        last_payload = response.json()
        if last_payload['status'] == expected_status:
            return last_payload

        time.sleep(0.05)

    message = (
        f'Job status is {last_payload.get("status")} instead of '
        f'{expected_status}.'
    )
    pytest.fail(message)
    raise AssertionError(message)


def _wait_for_export_status(
    client: TestClient,
    job_id: str,
    expected_status: str,
    max_attempts: int = 20,
) -> dict[str, Any]:
    last_payload: dict[str, Any] = {}

    for _ in range(max_attempts):
        response = client.get(f'/api/v1/jobs/{job_id}/export/status')
        assert response.status_code == 200

        last_payload = response.json()
        if last_payload['export_status'] == expected_status:
            return last_payload

        time.sleep(0.05)

    message = (
        f'Export status is {last_payload.get("export_status")} instead '
        f'of {expected_status}.'
    )
    pytest.fail(message)
    raise AssertionError(message)


def test_settings_use_desktop_workspace_when_profile_is_desktop(
    tmp_path: Path,
):
    desktop_workspace_dir = tmp_path / 'desktop-workspace'
    server_workspace_dir = tmp_path / 'server-workspace'

    test_settings = Settings(
        BACKEND_RUNTIME_PROFILE='desktop',
        WORKSPACE_DIR=server_workspace_dir,
        DESKTOP_WORKSPACE_DIR=desktop_workspace_dir,
        _env_file=None,
    )

    assert test_settings.workspace_root == desktop_workspace_dir.resolve(
        strict=False
    )


def test_path_policy_rejects_escape_from_base_directory(tmp_path: Path):
    base_dir = tmp_path / 'workspace'
    base_dir.mkdir(parents=True, exist_ok=True)

    safe_path = resolve_path_in_base(base_dir, 'jobs', 'file.txt')
    assert safe_path.is_relative_to(base_dir.resolve(strict=False))

    with pytest.raises(ValueError):
        resolve_path_in_base(base_dir, '..', 'outside.txt')


def test_desktop_runtime_endpoints_are_available():
    with TestClient(app) as client:
        health_response = client.get('/api/v1/desktop/health')
        assert health_response.status_code == 200
        assert health_response.json()['status'] == 'ok'

        runtime_response = client.get('/api/v1/desktop/runtime')
        assert runtime_response.status_code == 200

        runtime_payload = runtime_response.json()
        assert runtime_payload['runtime_profile'] in {'server', 'desktop'}
        assert runtime_payload['directories_ready'] is True

        for path_key in (
            'workspace_dir',
            'jobs_dir',
            'results_dir',
            'temp_dir',
        ):
            assert Path(runtime_payload[path_key]).exists()


def test_desktop_flow_upload_process_review_export(monkeypatch):
    monkeypatch.setattr(settings, 'DEFAULT_AI_PROVIDER', 'mock')

    files = {
        'files': ('sample.jpg', _build_tiny_jpeg_bytes(), 'image/jpeg'),
    }

    with TestClient(app) as client:
        upload_response = client.post('/api/v1/jobs/upload', files=files)
        assert upload_response.status_code == 200

        job_payload = upload_response.json()
        job_id = job_payload['job_id']

        process_response = client.post(f'/api/v1/jobs/{job_id}/process')
        assert process_response.status_code == 200

        status_payload = _wait_for_job_status(
            client,
            job_id,
            expected_status='completed',
        )
        assert status_payload['status'] == 'completed'

        results_response = client.get(f'/api/v1/jobs/{job_id}/results')
        assert results_response.status_code == 200
        results_payload = results_response.json()
        assert len(results_payload['results']) == 1

        start_export_response = client.post(
            f'/api/v1/jobs/{job_id}/export/csv'
        )
        assert start_export_response.status_code == 200

        export_status_payload = _wait_for_export_status(
            client,
            job_id,
            expected_status='completed',
        )
        assert export_status_payload['export_status'] == 'completed'

        download_response = client.get(f'/api/v1/jobs/{job_id}/export/csv')
        assert download_response.status_code == 200
        assert 'text/csv' in download_response.headers.get('content-type', '')

        stored_exports = list((RESULTS_DIR / job_id).glob('*.csv'))
        assert stored_exports
