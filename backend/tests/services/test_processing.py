from uuid import uuid4

import pytest

from app.core.enums import (
    AIProvider,
    FileStatus,
    JobStatus,
    MetadataFieldSource,
    StockPlatform,
)
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.ai.ai_provider import AIMetadataResponse
from app.services.desktop.app_settings import EffectiveAISettings
from app.services.processing import processing
from app.storage.jobs import storage


def _job(status: FileStatus = FileStatus.QUEUED) -> ProcessingJob:
    return ProcessingJob(
        ai_provider=AIProvider.MOCK,
        stock_platform=StockPlatform.SHUTTERSTOCK,
        files=[
            ProcessingJobFile(
                filename='photo.jpg',
                original_filename='photo.jpg',
                status=status,
            )
        ],
    )


def test_apply_generated_metadata_populates_fields_and_sources(monkeypatch):
    file = _job().files[0]
    metadata = AIMetadataResponse(
        title='Generated title',
        description='Generated description',
        keywords=['one', 'two'],
        categories=['Nature'],
        license_type='commercial',
        location_metadata='Paris, France',
        is_editorial=False,
        has_people=True,
        people_count=1,
        releases=['release.pdf'],
        prompt_version='v1',
    )
    monkeypatch.setattr(
        processing,
        'apply_stock_metadata_autofixes',
        lambda *_args: None,
    )

    processing.apply_generated_metadata_to_file(
        file,
        metadata,
        StockPlatform.SHUTTERSTOCK,
    )

    assert file.title == 'Generated title'
    assert file.categories == ['Nature']
    assert file.people_count == 1
    assert file.releases == ['release.pdf']
    assert file.prompt_version == 'v1'
    assert file.iptc_embedded_metadata is False
    assert set(file.field_sources.values()) == {MetadataFieldSource.GENERATED}


@pytest.mark.asyncio
async def test_process_job_completes_queued_files(monkeypatch):
    job = _job()
    await storage.create_job(job)
    monkeypatch.setattr(
        processing,
        'resolve_effective_ai_settings',
        lambda _provider: EffectiveAISettings(AIProvider.MOCK, None),
    )
    monkeypatch.setattr(
        processing,
        'validate_primary_provider_configuration',
        lambda _provider: None,
    )

    async def complete(file, *_args, **_kwargs):
        file.status = FileStatus.COMPLETED

    monkeypatch.setattr(processing, '_process_file', complete)

    await processing.process_job(job.job_id)

    assert job.status == JobStatus.COMPLETED
    assert job.files[0].status == FileStatus.COMPLETED
    assert job.effective_ai_provider == AIProvider.MOCK


@pytest.mark.asyncio
async def test_process_job_marks_pending_files_failed_on_setup_error(
    monkeypatch,
):
    job = _job()
    await storage.create_job(job)
    monkeypatch.setattr(
        processing,
        'resolve_effective_ai_settings',
        lambda _provider: (_ for _ in ()).throw(RuntimeError('bad provider')),
    )

    await processing.process_job(job.job_id)

    assert job.status == JobStatus.FAILED
    assert job.files[0].status == FileStatus.FAILED
    assert job.files[0].error_message == 'bad provider'


@pytest.mark.asyncio
async def test_retry_failed_files_only_retries_failed_entries(monkeypatch):
    job = _job(FileStatus.FAILED)
    completed_file = ProcessingJobFile(
        filename='done.jpg',
        original_filename='done.jpg',
        status=FileStatus.COMPLETED,
    )
    job.files.append(completed_file)
    await storage.create_job(job)
    monkeypatch.setattr(
        processing,
        'resolve_effective_ai_settings',
        lambda _provider: EffectiveAISettings(AIProvider.MOCK, None),
    )
    monkeypatch.setattr(
        processing,
        'validate_primary_provider_configuration',
        lambda _provider: None,
    )
    processed_ids = []

    async def complete(file, *_args, **_kwargs):
        processed_ids.append(file.file_id)
        file.status = FileStatus.COMPLETED

    monkeypatch.setattr(processing, '_process_file', complete)

    await processing.retry_failed_files(job.job_id)

    assert processed_ids == [job.files[0].file_id]
    assert job.status == JobStatus.COMPLETED
    assert all(file.status == FileStatus.COMPLETED for file in job.files)


@pytest.mark.asyncio
async def test_cancel_job_processing_marks_unfinished_files_cancelled():
    job = _job(FileStatus.PROCESSING)
    job.status = JobStatus.PROCESSING
    job.files.append(
        ProcessingJobFile(
            filename='done.jpg',
            original_filename='done.jpg',
            status=FileStatus.COMPLETED,
        )
    )
    await storage.create_job(job)

    await processing.cancel_job_processing(job.job_id)

    assert job.status == JobStatus.CANCELLED
    assert job.files[0].status == FileStatus.CANCELLED
    assert job.files[1].status == FileStatus.COMPLETED


@pytest.mark.asyncio
async def test_processing_helpers_handle_missing_jobs():
    missing_job_id = uuid4()

    await processing.process_job(missing_job_id)
    await processing.retry_failed_files(missing_job_id)
    await processing.cancel_job_processing(missing_job_id)

    assert await processing._is_job_cancelled(missing_job_id) is True
