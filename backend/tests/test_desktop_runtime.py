import asyncio
import time
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import PROJECT_ROOT, ROOT_ENV_FILE, Settings, settings
from app.core.constants import RESULTS_DIR
from app.core.runtime import resolve_path_in_base
from app.main import app
from app.schemas.provider_discovery import (
    ProviderDiscoveryItem,
    ProvidersDiscoveryResponse,
)
from app.services.desktop.desktop_startup import (
    desktop_startup_orchestrator,
    run_desktop_startup_checks,
)
from app.services.prompt_templates import (
    DEFAULT_PROMPT_LANGUAGE,
    METADATA_PROMPT_TEMPLATE_VERSION,
)


@pytest.fixture(autouse=True)
def reset_desktop_startup_orchestrator():
    desktop_startup_orchestrator.reset_for_tests()
    yield
    desktop_startup_orchestrator.reset_for_tests()


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


def test_settings_read_env_from_project_root():
    assert ROOT_ENV_FILE == PROJECT_ROOT / '.env'


def test_server_profile_resolves_relative_workspace_from_project_root():
    test_settings = Settings(
        BACKEND_RUNTIME_PROFILE='server',
        WORKSPACE_DIR='.',
        DESKTOP_WORKSPACE_DIR=None,
        _env_file=None,
    )

    assert test_settings.workspace_root == PROJECT_ROOT.resolve(strict=False)


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


def test_desktop_startup_status_endpoint_is_available():
    with TestClient(app) as client:
        response = client.get('/api/v1/desktop/startup/status')

    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] in {'ready', 'degraded', 'not_ready'}
    assert payload['phase'] in {'pending', 'checking', 'completed', 'failed'}
    assert 'attempts' in payload
    assert 'timeout_seconds' in payload


@pytest.mark.asyncio
async def test_desktop_startup_reports_ready_when_all_providers_ready(
    monkeypatch,
):
    async def _fake_discovery() -> ProvidersDiscoveryResponse:
        return ProvidersDiscoveryResponse(
            providers=[
                ProviderDiscoveryItem(
                    provider='ollama',
                    display_name='Ollama',
                    ready=True,
                    status='ready',
                    configured=True,
                    local=True,
                ),
            ],
            ready_providers=['ollama'],
            recommended_provider='ollama',
            has_ready_provider=True,
            hints=['ready'],
        )

    monkeypatch.setattr(
        'app.services.desktop.desktop_startup.discover_ai_providers',
        _fake_discovery,
    )
    monkeypatch.setattr(
        settings, 'DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS', 1
    )
    monkeypatch.setattr(settings, 'DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS', 1)
    monkeypatch.setattr(
        settings,
        'DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS',
        0,
    )

    status = await run_desktop_startup_checks()

    assert status.status == 'ready'
    assert status.phase == 'completed'
    assert status.ready_providers == ['ollama']
    assert status.reason_codes == []


@pytest.mark.asyncio
async def test_desktop_startup_reports_degraded_with_partial_readiness(
    monkeypatch,
):
    async def _fake_discovery() -> ProvidersDiscoveryResponse:
        return ProvidersDiscoveryResponse(
            providers=[
                ProviderDiscoveryItem(
                    provider='ollama',
                    display_name='Ollama',
                    ready=True,
                    status='ready',
                    configured=True,
                    local=True,
                ),
                ProviderDiscoveryItem(
                    provider='gemini',
                    display_name='Gemini',
                    ready=False,
                    status='not_ready',
                    reason_code='gemini_api_key_missing',
                    reason='Gemini API key is not configured.',
                    configured=False,
                    local=False,
                ),
            ],
            ready_providers=['ollama'],
            recommended_provider='ollama',
            has_ready_provider=True,
            hints=['partial'],
        )

    monkeypatch.setattr(
        'app.services.desktop.desktop_startup.discover_ai_providers',
        _fake_discovery,
    )
    monkeypatch.setattr(
        settings, 'DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS', 1
    )
    monkeypatch.setattr(settings, 'DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS', 1)
    monkeypatch.setattr(
        settings,
        'DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS',
        0,
    )

    status = await run_desktop_startup_checks()

    assert status.status == 'degraded'
    assert status.phase == 'completed'
    assert status.has_ready_provider is True
    assert status.reason_codes == ['gemini_api_key_missing']
    assert status.degradation_reasons == ['Gemini API key is not configured.']


@pytest.mark.asyncio
async def test_desktop_startup_reports_not_ready_without_ready_providers(
    monkeypatch,
):
    async def _fake_discovery() -> ProvidersDiscoveryResponse:
        return ProvidersDiscoveryResponse(
            providers=[
                ProviderDiscoveryItem(
                    provider='ollama',
                    display_name='Ollama',
                    ready=False,
                    status='not_ready',
                    reason_code='ollama_runtime_unavailable',
                    reason='Ollama runtime is not reachable.',
                    configured=True,
                    local=True,
                ),
            ],
            ready_providers=[],
            recommended_provider=None,
            has_ready_provider=False,
            hints=['setup'],
        )

    monkeypatch.setattr(
        'app.services.desktop.desktop_startup.discover_ai_providers',
        _fake_discovery,
    )
    monkeypatch.setattr(
        settings, 'DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS', 1
    )
    monkeypatch.setattr(settings, 'DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS', 1)
    monkeypatch.setattr(
        settings,
        'DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS',
        0,
    )

    status = await run_desktop_startup_checks()

    assert status.status == 'not_ready'
    assert status.phase == 'completed'
    assert status.has_ready_provider is False
    assert status.reason_codes == ['ollama_runtime_unavailable']


@pytest.mark.asyncio
async def test_desktop_startup_retries_and_fails_on_timeout(monkeypatch):
    attempts = 0

    async def _slow_discovery() -> ProvidersDiscoveryResponse:
        nonlocal attempts
        attempts += 1
        await asyncio.sleep(0.05)
        return ProvidersDiscoveryResponse()

    monkeypatch.setattr(
        'app.services.desktop.desktop_startup.discover_ai_providers',
        _slow_discovery,
    )
    monkeypatch.setattr(
        settings,
        'DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS',
        0.001,
    )
    monkeypatch.setattr(settings, 'DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS', 2)
    monkeypatch.setattr(
        settings,
        'DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS',
        0,
    )

    status = await run_desktop_startup_checks()

    assert attempts == 2
    assert status.status == 'not_ready'
    assert status.phase == 'failed'
    assert status.reason_codes == ['startup_ai_readiness_timeout']


def test_desktop_flow_upload_process_review_export():
    files = {
        'files': ('sample.jpg', _build_tiny_jpeg_bytes(), 'image/jpeg'),
    }

    with TestClient(app) as client:
        upload_response = client.post('/api/v1/jobs/upload', files=files)
        assert upload_response.status_code == 200

        job_payload = upload_response.json()
        job_id = job_payload['job_id']

        settings_response = client.patch(
            f'/api/v1/jobs/{job_id}/settings',
            json={'ai_provider': 'mock'},
        )
        assert settings_response.status_code == 200
        assert settings_response.json()['ai_provider'] == 'mock'
        assert settings_response.json()['effective_ai_provider'] == 'mock'

        process_response = client.post(f'/api/v1/jobs/{job_id}/process')
        assert process_response.status_code == 200
        assert process_response.json()['effective_ai_provider'] == 'mock'

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
        result = results_payload['results'][0]
        assert result['prompt_version'] == METADATA_PROMPT_TEMPLATE_VERSION
        assert result['prompt_language'] == DEFAULT_PROMPT_LANGUAGE

        start_export_response = client.post(
            f'/api/v1/jobs/{job_id}/export',
            params={'csv': 'true'},
        )
        assert start_export_response.status_code == 200

        export_status_payload = _wait_for_export_status(
            client,
            job_id,
            expected_status='completed',
        )
        assert export_status_payload['export_status'] == 'completed'

        download_response = client.get(
            f'/api/v1/jobs/{job_id}/export',
            params={'csv': 'true'},
        )
        assert download_response.status_code == 200
        assert 'text/csv' in download_response.headers.get('content-type', '')

        stored_exports = list((RESULTS_DIR / job_id).glob('*.csv'))
        assert stored_exports


def test_open_results_folder_endpoint(monkeypatch):
    job_id = uuid4()
    results_dir = RESULTS_DIR / str(job_id)
    results_dir.mkdir(parents=True, exist_ok=True)

    opened: dict[str, Path] = {}

    def _fake_open(path: Path) -> None:
        opened['path'] = path

    monkeypatch.setattr(
        'app.api.v1.desktop.open_path_in_default_app',
        _fake_open,
    )

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/jobs/{job_id}/open-results-folder'
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert payload['action'] == 'open_results_folder'
    assert payload['path'] == str(results_dir)
    assert opened['path'] == results_dir


def test_open_results_folder_endpoint_returns_normalized_404():
    job_id = uuid4()

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/jobs/{job_id}/open-results-folder'
        )

    assert response.status_code == 404
    payload = response.json()
    assert payload == {
        'status': 'error',
        'action': 'open_results_folder',
        'message': 'Results directory not found',
        'code': 'RESULTS_DIR_NOT_FOUND',
        'path': None,
    }


def test_open_result_file_endpoint(monkeypatch):
    job_id = uuid4()
    results_dir = RESULTS_DIR / str(job_id)
    results_dir.mkdir(parents=True, exist_ok=True)

    file_name = 'result.csv'
    file_path = results_dir / file_name
    file_path.write_text('title,keywords\nsample,one two', encoding='utf-8')

    opened: dict[str, Path] = {}

    def _fake_open(path: Path) -> None:
        opened['path'] = path

    monkeypatch.setattr(
        'app.api.v1.desktop.open_path_in_default_app',
        _fake_open,
    )

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/jobs/{job_id}/open-result-file',
            params={'filename': file_name},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert payload['action'] == 'open_result_file'
    assert payload['path'] == str(file_path)
    assert opened['path'] == file_path


def test_open_result_file_endpoint_rejects_unsupported_type():
    job_id = uuid4()
    results_dir = RESULTS_DIR / str(job_id)
    results_dir.mkdir(parents=True, exist_ok=True)
    (results_dir / 'malware.exe').write_text('x', encoding='utf-8')

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/jobs/{job_id}/open-result-file',
            params={'filename': 'malware.exe'},
        )

    assert response.status_code == 400
    payload = response.json()
    assert payload == {
        'status': 'error',
        'action': 'open_result_file',
        'message': 'Only CSV, IPTC, JPG and ZIP files are allowed',
        'code': 'UNSUPPORTED_FILE_TYPE',
        'path': None,
    }


def test_open_result_file_endpoint_rejects_path_escape():
    job_id = uuid4()
    results_dir = RESULTS_DIR / str(job_id)
    results_dir.mkdir(parents=True, exist_ok=True)

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/jobs/{job_id}/open-result-file',
            params={'filename': '../outside.csv'},
        )

    assert response.status_code == 400
    payload = response.json()
    assert payload == {
        'status': 'error',
        'action': 'open_result_file',
        'message': 'Path is outside allowed results directory',
        'code': 'PATH_POLICY_VIOLATION',
        'path': None,
    }


def test_open_result_file_endpoint_returns_normalized_404():
    job_id = uuid4()
    results_dir = RESULTS_DIR / str(job_id)
    results_dir.mkdir(parents=True, exist_ok=True)

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/desktop/jobs/{job_id}/open-result-file',
            params={'filename': 'missing.csv'},
        )

    assert response.status_code == 404
    payload = response.json()
    assert payload == {
        'status': 'error',
        'action': 'open_result_file',
        'message': 'Result file not found',
        'code': 'RESULT_FILE_NOT_FOUND',
        'path': None,
    }


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
