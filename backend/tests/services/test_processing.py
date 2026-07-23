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
async def test_cancel_and_reset_job_leaves_no_partial_results():
    """
    Отменённая задача возвращается в состояние «до старта»: файлы снова
    queued, а метаданные успевших обработаться файлов стёрты.
    """
    job = _job(FileStatus.PROCESSING)
    job.status = JobStatus.PROCESSING
    job.effective_ai_provider = AIProvider.MOCK
    job.effective_ai_model = 'mock-model'
    job.files.append(
        ProcessingJobFile(
            filename='done.jpg',
            original_filename='done.jpg',
            status=FileStatus.COMPLETED,
            title='Generated title',
            description='Generated description',
            keywords=['one', 'two'],
            effective_ai_provider=AIProvider.MOCK,
            effective_ai_model='mock-model',
            error_message='some error',
            field_sources={'title': MetadataFieldSource.GENERATED},
        )
    )
    await storage.create_job(job)

    await processing.cancel_and_reset_job(job.job_id)

    reset_job = await storage.get_job(job.job_id)
    assert reset_job is not None
    assert reset_job.status == JobStatus.QUEUED
    assert reset_job.effective_ai_provider is None
    assert reset_job.effective_ai_model is None
    assert len(reset_job.files) == 2

    for file in reset_job.files:
        assert file.status == FileStatus.QUEUED
        assert file.title is None
        assert file.description is None
        assert file.keywords == []
        assert file.error_message is None
        assert file.effective_ai_provider is None
        assert file.effective_ai_model is None
        assert file.field_sources == {}

    # Сам список файлов не меняется — фото остаются добавленными.
    assert [file.filename for file in reset_job.files] == [
        'photo.jpg',
        'done.jpg',
    ]


@pytest.mark.asyncio
async def test_cancel_and_reset_job_preserves_file_identity():
    """
    Сброс сохраняет file_id, иначе фронтенд потеряет привязку превью к фото.
    """
    job = _job(FileStatus.PROCESSING)
    job.status = JobStatus.PROCESSING
    original_file_id = job.files[0].file_id
    await storage.create_job(job)

    await processing.cancel_and_reset_job(job.job_id)

    reset_job = await storage.get_job(job.job_id)
    assert reset_job is not None
    assert reset_job.files[0].file_id == original_file_id
    assert reset_job.files[0].original_filename == 'photo.jpg'


@pytest.mark.asyncio
async def test_processing_helpers_handle_missing_jobs():
    missing_job_id = uuid4()

    await processing.process_job(missing_job_id)
    await processing.retry_failed_files(missing_job_id)
    await processing.cancel_job_processing(missing_job_id)
    await processing.cancel_and_reset_job(missing_job_id)

    assert await processing._is_job_cancelled(missing_job_id) is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('status', 'entry_point'),
    [
        (FileStatus.QUEUED, 'process_job'),
        (FileStatus.FAILED, 'retry_failed_files'),
    ],
)
async def test_local_provider_availability_refreshed_once_per_job(
    monkeypatch,
    status,
    entry_point,
):
    job = _job(status)
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
    refresh_calls = []

    async def refresh():
        refresh_calls.append(True)
        return True

    monkeypatch.setattr(
        processing,
        'refresh_local_provider_availability',
        refresh,
    )

    async def complete(file, *_args, **_kwargs):
        file.status = FileStatus.COMPLETED

    monkeypatch.setattr(processing, '_process_file', complete)

    await getattr(processing, entry_point)(job.job_id)

    assert len(refresh_calls) == 1
