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


def _job_with_short_title() -> ProcessingJob:
    """
    Готовая задача под Adobe Stock: заголовок короче минимума Getty.
    """
    return ProcessingJob(
        ai_provider=AIProvider.MOCK,
        stock_platform=StockPlatform.ADOBE_STOCK,
        status=JobStatus.COMPLETED,
        effective_ai_provider=AIProvider.MOCK,
        effective_ai_model='mock-model',
        files=[
            ProcessingJobFile(
                filename='flamingo.jpg',
                original_filename='flamingo.jpg',
                status=FileStatus.COMPLETED,
                title='Flamingo Courtship Behavior',
                description=(
                    'A close-up of two flamingos engaging in a courtship '
                    'ritual with vibrant pink plumage.'
                ),
                keywords=[
                    'flamingo',
                    'courtship',
                    'behavior',
                    'nature',
                    'wildlife',
                    'bird',
                    'animal',
                ],
                categories=['Animals'],
                effective_ai_provider=AIProvider.MOCK,
                effective_ai_model='mock-model',
            ),
        ],
    )


@pytest.mark.asyncio
async def test_switching_platform_autofixes_title_min_words():
    """
    При переключении на Getty короткий заголовок чинится сразу,
    без ручной правки других полей.
    """
    job = _job_with_short_title()
    await storage.create_job(job)

    with TestClient(app) as client:
        response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'stock_platform': StockPlatform.GETTY_IMAGES.value},
        )

    assert response.status_code == 200
    result = response.json()['results'][0]

    title_errors = [
        error
        for error in result['preview']['errors']
        if error['field'] == 'title'
    ]
    assert title_errors == []

    preview_title = next(
        field['value']
        for field in result['preview']['common_fields']
        if field['key'] == 'title'
    )
    assert len(preview_title.split()) >= 5

    # правка сохраняется в задаче, а не только в ответе
    stored_job = await storage.get_job(job.job_id)
    assert len(stored_job.files[0].title.split()) >= 5


@pytest.mark.asyncio
async def test_results_do_not_autofix_unfinished_files():
    """
    Файлы, ещё не завершённые, автофикс не трогает.
    """
    job = _job_with_short_title()
    job.status = JobStatus.PROCESSING
    job.files.append(
        ProcessingJobFile(
            filename='pending.jpg',
            original_filename='pending.jpg',
            status=FileStatus.PROCESSING,
        )
    )
    await storage.create_job(job)

    with TestClient(app) as client:
        response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'stock_platform': StockPlatform.GETTY_IMAGES.value},
        )

    assert response.status_code == 200

    stored_job = await storage.get_job(job.job_id)
    pending_file = next(
        file
        for file in stored_job.files
        if file.original_filename == 'pending.jpg'
    )
    assert not pending_file.title
