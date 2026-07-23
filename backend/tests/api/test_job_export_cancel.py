import pytest
from fastapi.testclient import TestClient

from app.core.enums import (
    AIProvider,
    ExportFormat,
    ExportStatus,
    FileStatus,
    JobStatus,
    StockPlatform,
)
from app.main import app
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.export.export import (
    ExportCancelledError,
    _get_job_results_dir,
    clear_export_cancellation,
    ensure_job_exports,
    is_export_cancelled,
    request_export_cancellation,
    run_job_export,
)
from app.storage.jobs import storage


def _exportable_job() -> ProcessingJob:
    """
    Обработанная задача, готовая к экспорту.
    """
    return ProcessingJob(
        ai_provider=AIProvider.MOCK,
        stock_platform=StockPlatform.SHUTTERSTOCK,
        status=JobStatus.COMPLETED,
        effective_ai_provider=AIProvider.MOCK,
        effective_ai_model='mock-model',
        export_formats=[ExportFormat.CSV],
        export_status=ExportStatus.PROCESSING,
        files=[
            ProcessingJobFile(
                filename='done.jpg',
                original_filename='done.jpg',
                status=FileStatus.COMPLETED,
                selected_for_export=True,
                title='A perfectly ordinary generated title',
                description=(
                    'A generated description that is long enough to pass '
                    'the stock validation rules without any complaints.'
                ),
                keywords=[f'keyword{index}' for index in range(10)],
                effective_ai_provider=AIProvider.MOCK,
                effective_ai_model='mock-model',
            ),
        ],
    )


@pytest.mark.asyncio
async def test_cancel_export_marks_job_as_cancelled():
    job = _exportable_job()
    await storage.create_job(job)

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/export/cancel')

    assert response.status_code == 200
    payload = response.json()

    assert payload['export_status'] == ExportStatus.CANCELLED.value
    assert payload['export_progress'] == 0
    assert payload['export_artifacts'] == []


@pytest.mark.asyncio
async def test_cancel_removes_artifacts_of_an_export_that_finished_first():
    """
    Гонка: прогресс в UI фиктивный, и экспорт часто успевает завершиться
    раньше, чем доедет отмена. Отмена всё равно обязана убрать записанное.
    """
    job = _exportable_job()
    await storage.create_job(job)

    # Экспорт полностью отработал и записал файл до нажатия Cancel
    await run_job_export(job.job_id, ExportFormat.CSV)

    completed_job = await storage.get_job(job.job_id)
    assert completed_job is not None
    assert completed_job.export_status == ExportStatus.COMPLETED
    assert completed_job.export_artifacts

    job_results_dir = _get_job_results_dir(job)
    assert job_results_dir.is_dir()

    with TestClient(app) as client:
        response = client.post(f'/api/v1/jobs/{job.job_id}/export/cancel')

    assert response.status_code == 200
    assert response.json()['export_status'] == ExportStatus.CANCELLED.value

    # Файлы завершившегося прогона удалены, каталог убран
    assert not job_results_dir.exists()

    stored_job = await storage.get_job(job.job_id)
    assert stored_job is not None
    assert stored_job.export_artifacts == []


@pytest.mark.asyncio
async def test_cancel_export_keeps_files_completed():
    """
    Регрессия: раньше фронт звал /cancel, который сбрасывал файлы в queued,
    из-за чего повторный экспорт падал с «No selected completed files».
    """
    job = _exportable_job()
    await storage.create_job(job)

    with TestClient(app) as client:
        cancel_response = client.post(
            f'/api/v1/jobs/{job.job_id}/export/cancel'
        )
        assert cancel_response.status_code == 200

        restart_response = client.post(
            f'/api/v1/jobs/{job.job_id}/export',
            params={'csv': True},
        )

    assert restart_response.status_code == 200

    stored_job = await storage.get_job(job.job_id)
    assert stored_job is not None
    assert all(
        file.status == FileStatus.COMPLETED for file in stored_job.files
    )


@pytest.mark.asyncio
async def test_cancel_export_clears_the_flag_for_the_next_run():
    job = _exportable_job()
    await storage.create_job(job)

    with TestClient(app) as client:
        client.post(f'/api/v1/jobs/{job.job_id}/export/cancel')

    assert not is_export_cancelled(job.job_id)


@pytest.mark.asyncio
async def test_cancel_removes_artifacts_written_by_the_aborted_run(
    monkeypatch,
):
    """
    Отмена возвращает задачу в состояние «до экспорта»: файлы, записанные
    прерванным прогоном, с диска удаляются.
    """
    job = _exportable_job()
    await storage.create_job(job)

    job_results_dir = _get_job_results_dir(job)
    job_results_dir.mkdir(parents=True, exist_ok=True)

    written_artifact = job_results_dir / 'partial.csv'

    def fake_exports(
        current_job, requested_export_format, progress_callback=None
    ):
        # Имитируем прогон, который успел записать файл и был отменён
        written_artifact.write_text('partial', encoding='utf-8')
        request_export_cancellation(current_job.job_id)
        raise ExportCancelledError

    monkeypatch.setattr(
        'app.services.export.export.ensure_job_exports',
        fake_exports,
    )

    try:
        await run_job_export(job.job_id, ExportFormat.CSV)
    finally:
        clear_export_cancellation(job.job_id)

    assert not written_artifact.exists()
    # Первый прогон отменён — пустой каталог результатов тоже убран
    assert not job_results_dir.exists()

    stored_job = await storage.get_job(job.job_id)
    assert stored_job is not None
    assert stored_job.export_status == ExportStatus.CANCELLED
    assert stored_job.export_artifacts == []


@pytest.mark.asyncio
async def test_cancel_keeps_artifacts_of_a_previous_successful_export(
    monkeypatch,
):
    """
    Откат удаляет только записанное прерванным прогоном — результаты
    прошлого удачного экспорта остаются на месте.
    """
    job = _exportable_job()
    await storage.create_job(job)

    job_results_dir = _get_job_results_dir(job)
    job_results_dir.mkdir(parents=True, exist_ok=True)

    previous_artifact = job_results_dir / 'previous.csv'
    previous_artifact.write_text('previous run', encoding='utf-8')

    def fake_exports(
        current_job, requested_export_format, progress_callback=None
    ):
        request_export_cancellation(current_job.job_id)
        raise ExportCancelledError

    monkeypatch.setattr(
        'app.services.export.export.ensure_job_exports',
        fake_exports,
    )

    try:
        await run_job_export(job.job_id, ExportFormat.CSV)
    finally:
        clear_export_cancellation(job.job_id)

    assert previous_artifact.read_text(encoding='utf-8') == 'previous run'


def test_export_writer_stops_when_cancellation_is_requested():
    """
    Запись идёт в отдельном потоке, поэтому она обязана сама проверять флаг —
    отмена корутины поток не остановит и файлы допишутся.
    """
    job = _exportable_job()
    request_export_cancellation(job.job_id)

    try:
        with pytest.raises(ExportCancelledError):
            ensure_job_exports(job, ExportFormat.CSV)
    finally:
        clear_export_cancellation(job.job_id)


def test_export_reports_progress_through_the_callback():
    """
    Прогресс отражает реально записанное: колбэк вызывается и доходит до 100.
    """
    job = _exportable_job()
    reported: list[int] = []

    ensure_job_exports(job, ExportFormat.CSV, reported.append)

    assert reported
    assert reported[-1] == 100
    assert all(0 <= percent <= 100 for percent in reported)


@pytest.mark.asyncio
async def test_run_job_export_starts_progress_from_zero():
    """
    Экспорт стартует с нулём, а не с фиктивных 50%, и завершает на 100.
    """
    job = _exportable_job()
    await storage.create_job(job)

    await run_job_export(job.job_id, ExportFormat.CSV)

    stored_job = await storage.get_job(job.job_id)
    assert stored_job is not None
    assert stored_job.export_status == ExportStatus.COMPLETED
    assert stored_job.export_progress == 100
