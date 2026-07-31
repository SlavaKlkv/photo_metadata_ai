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
