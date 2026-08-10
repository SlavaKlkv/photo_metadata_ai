from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.jobs import jobs as jobs_api
from app.core.enums import (
    AIProvider,
    FileStatus,
    JobStatus,
    StockPlatform,
)
from app.main import app
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.storage.jobs import storage


def _job_with_failed_file() -> ProcessingJob:
    """Обработанная задача, в которой один файл упал."""
    return ProcessingJob(
        ai_provider=AIProvider.MOCK,
        stock_platform=StockPlatform.SHUTTERSTOCK,
        status=JobStatus.COMPLETED,
        files=[
            ProcessingJobFile(
                filename='done.jpg',
                original_filename='done.jpg',
                status=FileStatus.COMPLETED,
                title='Generated title',
            ),
            ProcessingJobFile(
                filename='failed.jpg',
                original_filename='failed.jpg',
                status=FileStatus.FAILED,
                error_message='AI provider timed out',
            ),
        ],
    )


@pytest.fixture
def started_jobs(monkeypatch) -> list:
    """Перехватывает запуск фоновой обработки, не выполняя её."""
    started: list = []

    def fake_start(job_id, handler) -> bool:
        started.append((job_id, handler))
        return True

    monkeypatch.setattr(jobs_api.job_task_manager, 'start', fake_start)
    monkeypatch.setattr(
        jobs_api.job_task_manager, 'is_running', lambda _job_id: False
    )
    return started


@pytest.mark.asyncio
async def test_retry_failed_starts_processing_of_failed_files(started_jobs):
    job = _job_with_failed_file()
    await storage.create_job(job)

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/retry-failed')

    assert response.status_code == 200
    assert response.json()['job_id'] == str(job.job_id)
    assert [job_id for job_id, _ in started_jobs] == [job.job_id]


@pytest.mark.asyncio
async def test_retry_failed_returns_404_for_unknown_job(started_jobs):
    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{uuid4()}/retry-failed')

    assert response.status_code == 404
    assert started_jobs == []


@pytest.mark.asyncio
async def test_retry_failed_returns_400_without_failed_files(started_jobs):
    job = _job_with_failed_file()
    job.files[1].status = FileStatus.COMPLETED
    await storage.create_job(job)

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/retry-failed')

    assert response.status_code == 400
    assert started_jobs == []


@pytest.mark.asyncio
async def test_retry_failed_returns_409_while_processing_runs(monkeypatch):
    job = _job_with_failed_file()
    await storage.create_job(job)

    monkeypatch.setattr(
        jobs_api.job_task_manager, 'is_running', lambda _job_id: True
    )

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/retry-failed')

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_cancel_retry_keeps_completed_files_and_restores_failed(
    monkeypatch,
):
    """Отмена повтора не трогает готовые файлы, прерванные — снова failed."""
    job = _job_with_failed_file()
    job.status = JobStatus.PROCESSING
    job.files[1].status = FileStatus.PROCESSING
    job.files[1].error_message = None
    await storage.create_job(job)

    async def fake_cancel_and_wait(_job_id) -> None:
        return None

    monkeypatch.setattr(
        jobs_api.job_task_manager, 'cancel_and_wait', fake_cancel_and_wait
    )

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/cancel-retry')

    assert response.status_code == 200

    payload = response.json()
    assert payload['status'] == JobStatus.FAILED

    done_file, retried_file = payload['files']
    # Результат прошлого прогона уцелел.
    assert done_file['status'] == FileStatus.COMPLETED
    assert done_file['title'] == 'Generated title'
    # Прерванный файл вернулся в исходное состояние — повтор снова доступен.
    assert retried_file['status'] == FileStatus.FAILED
    assert retried_file['error_message'] == 'Processing cancelled'


@pytest.mark.asyncio
async def test_cancel_retry_returns_404_for_unknown_job():
    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{uuid4()}/cancel-retry')

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_cancel_retry_never_exposes_cancelled_status(monkeypatch):
    """Отмена повтора не показывает cancelled даже на мгновение.

    Фронтенд трактует этот статус как отмену всего батча и сбрасывает
    результаты, поэтому промежуточного состояния быть не должно.
    """
    from app.services.processing import processing

    job = _job_with_failed_file()
    job.status = JobStatus.PROCESSING
    job.files[1].status = FileStatus.PROCESSING
    await storage.create_job(job)

    observed_statuses: list[str] = []

    async def fake_cancel_and_wait(job_id) -> bool:
        # Фоновая обработка при отмене проходит через общую пометку задачи.
        await processing._mark_job_as_cancelled(job_id)
        stored = await storage.get_job(job_id)
        observed_statuses.append(stored.status)
        return True

    monkeypatch.setattr(
        jobs_api.job_task_manager, 'cancel_and_wait', fake_cancel_and_wait
    )

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/cancel-retry')

    assert response.status_code == 200
    assert observed_statuses == [JobStatus.FAILED]
    assert response.json()['status'] == JobStatus.FAILED
