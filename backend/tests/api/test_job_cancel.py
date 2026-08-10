import pytest
from fastapi.testclient import TestClient

from app.core.enums import (
    AIProvider,
    FileStatus,
    JobStatus,
    StockPlatform,
)
from app.main import app
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.storage.jobs import storage


def _processing_job() -> ProcessingJob:
    """
    Задача в разгаре обработки: один файл готов, второй ещё в работе.
    """
    return ProcessingJob(
        ai_provider=AIProvider.MOCK,
        stock_platform=StockPlatform.SHUTTERSTOCK,
        status=JobStatus.PROCESSING,
        effective_ai_provider=AIProvider.MOCK,
        effective_ai_model='mock-model',
        files=[
            ProcessingJobFile(
                filename='done.jpg',
                original_filename='done.jpg',
                status=FileStatus.COMPLETED,
                title='Generated title',
                description='Generated description',
                keywords=['one', 'two'],
                effective_ai_provider=AIProvider.MOCK,
                effective_ai_model='mock-model',
            ),
            ProcessingJobFile(
                filename='pending.jpg',
                original_filename='pending.jpg',
                status=FileStatus.PROCESSING,
            ),
        ],
    )


@pytest.mark.asyncio
async def test_cancel_returns_job_to_queued_without_partial_results():
    job = _processing_job()
    await storage.create_job(job)

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/cancel')

    assert response.status_code == 200
    payload = response.json()

    assert payload['status'] == JobStatus.QUEUED.value
    assert len(payload['files']) == 2

    for file in payload['files']:
        assert file['status'] == FileStatus.QUEUED.value
        assert file['title'] is None
        assert file['description'] is None
        assert file['keywords'] == []


@pytest.mark.asyncio
async def test_processing_can_be_restarted_after_cancel():
    """
    Регрессия: раньше /cancel оставлял задачу в cancelled и повторный
    /process падал с 400 «already started or finished».
    """
    job = _processing_job()
    await storage.create_job(job)

    with TestClient(app) as client:
        cancel_response = client.post(f'/api/v1/jobs/{job.job_id}/cancel')
        assert cancel_response.status_code == 200

        restart_response = client.post(f'/api/v1/jobs/{job.job_id}/process')

    assert restart_response.status_code == 200
    assert restart_response.json()['status'] == JobStatus.PROCESSING.value


def test_cancel_returns_404_for_unknown_job():
    with TestClient(app) as client:
        response = client.post(
            '/api/v1/jobs/00000000-0000-0000-0000-000000000000/cancel'
        )

    assert response.status_code == 404
