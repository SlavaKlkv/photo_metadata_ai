import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.enums import (
    ExportFormat,
    ExportStatus,
    FileStatus,
    StockPlatform,
)
from app.schemas.export import ExportArtifact
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.export import export as export_service
from app.storage.jobs import storage


def _completed_job() -> ProcessingJob:
    return ProcessingJob(
        stock_platform=StockPlatform.SHUTTERSTOCK,
        files=[
            ProcessingJobFile(
                filename='photo.jpg',
                original_filename='photo.jpg',
                status=FileStatus.COMPLETED,
                title='A descriptive stock photo title',
                description='A useful description of the stock photograph.',
                keywords=['photo', 'stock', 'example', 'image', 'subject'],
                categories=['Nature'],
                license_type='commercial',
            )
        ],
    )


def test_export_filename_and_paths_are_stock_aware():
    job = _completed_job()
    csv_path = export_service.get_job_export_path(job, ExportFormat.CSV)
    iptc_path = export_service.get_job_iptc_export_path(job, job.files[0])

    assert csv_path.name == (f'{job.job_id}_{StockPlatform.SHUTTERSTOCK}.csv')
    assert iptc_path.name == 'photo.jpg'
    assert csv_path.parent == iptc_path.parent
    assert (
        export_service.get_export_filename(
            job,
            ExportFormat.JSON,
        )
        == f'{job.job_id}_json'
    )


def test_iptc_export_path_uses_original_filename_without_uuid_prefix():
    job = _completed_job()
    file = job.files[0]
    # так файл лежит в uploads: внутреннее имя с UUID-префиксом
    file.filename = f'{file.file_id}_seaside-sunset.jpg'
    file.original_filename = 'seaside-sunset.jpg'

    iptc_path = export_service.get_job_iptc_export_path(job, file)

    assert iptc_path.name == 'seaside-sunset.jpg'
    assert str(file.file_id) not in iptc_path.name


def test_iptc_export_path_strips_directories_from_original_filename():
    job = _completed_job()
    file = job.files[0]
    file.filename = 'safe-internal-name.jpg'
    file.original_filename = '../../escape.jpg'

    iptc_path = export_service.get_job_iptc_export_path(job, file)

    # путь не уходит выше каталога задачи, каким бы ни было имя из upload
    assert iptc_path.name == 'escape.jpg'
    assert iptc_path.parent.name == str(job.job_id)


def test_iptc_export_path_falls_back_to_internal_name_when_original_empty():
    job = _completed_job()
    file = job.files[0]
    file.filename = 'safe-internal-name.jpg'
    file.original_filename = ''

    iptc_path = export_service.get_job_iptc_export_path(job, file)

    assert iptc_path.name == 'safe-internal-name.jpg'


def test_load_stored_export_returns_none_then_csv(monkeypatch):
    job = _completed_job()
    monkeypatch.setattr(
        export_service,
        '_collect_export_validation_errors',
        lambda *_args: [],
    )

    assert export_service.load_stored_job_export(job, ExportFormat.CSV) is None

    path = export_service.store_job_export(job, ExportFormat.CSV)
    content, filename, media_type = export_service.load_stored_job_export(
        job, ExportFormat.CSV
    )

    assert path.is_file()
    assert content.startswith('Filename,Title,Description,Keywords')
    assert filename == path.name
    assert media_type == 'text/csv; charset=utf-8'


def test_export_rejects_unsupported_format_and_empty_selection(monkeypatch):
    job = _completed_job()
    job.files[0].selected_for_export = False

    with pytest.raises(ValueError, match='Unsupported export format'):
        export_service.generate_job_export(job, ExportFormat.JSON)

    with pytest.raises(ValueError, match='No selected completed files'):
        export_service.ensure_job_exports(job, ExportFormat.CSV)

    job.export_formats = [ExportFormat.JSON]
    monkeypatch.setattr(
        export_service,
        '_collect_export_validation_errors',
        lambda *_args: [],
    )
    job.files[0].selected_for_export = True

    with pytest.raises(ValueError, match='Unsupported export format'):
        export_service.ensure_job_exports(job, ExportFormat.JSON)


def test_export_validation_error_is_compact_and_includes_hidden_count():
    message = export_service._format_export_validation_error(
        [
            {'filename': f'{index}.jpg', 'errors': ['missing title']}
            for index in range(5)
        ]
    )

    assert '0.jpg: missing title' in message
    assert 'and 2 more files' in message


def test_extract_export_error_message_handles_http_detail():
    assert (
        export_service._extract_export_error_message(
            HTTPException(status_code=400, detail='bad export')
        )
        == 'bad export'
    )
    assert (
        export_service._extract_export_error_message(
            HTTPException(status_code=400, detail={'code': 'bad'})
        )
        == 'Export failed'
    )


@pytest.mark.asyncio
async def test_run_job_export_completes(monkeypatch):
    job = _completed_job()
    await storage.create_job(job)
    artifact_path = Path('artifact.csv')

    monkeypatch.setattr(
        export_service,
        'ensure_job_exports',
        lambda *_args: [
            ExportArtifact(
                export_format=ExportFormat.CSV,
                path=str(artifact_path),
                filename=artifact_path.name,
                size_bytes=10,
                count=1,
            )
        ],
    )

    await export_service.run_job_export(job.job_id, ExportFormat.CSV)

    assert job.export_status == ExportStatus.COMPLETED
    assert job.export_progress == 100
    assert job.export_artifacts[0].filename == 'artifact.csv'


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('error', 'message'),
    [
        (ValueError('invalid metadata'), 'invalid metadata'),
        (RuntimeError('unexpected'), 'Unexpected export error'),
    ],
)
async def test_run_job_export_marks_failures(monkeypatch, error, message):
    job = _completed_job()
    await storage.create_job(job)

    def fail(*_args):
        raise error

    monkeypatch.setattr(export_service, 'ensure_job_exports', fail)

    await export_service.run_job_export(job.job_id, ExportFormat.CSV)

    assert job.export_status == ExportStatus.FAILED
    assert job.export_progress == 100
    assert job.export_error_message == message


@pytest.mark.asyncio
async def test_run_job_export_marks_cancellation(monkeypatch):
    job = _completed_job()
    await storage.create_job(job)

    def cancel(*_args):
        raise asyncio.CancelledError

    monkeypatch.setattr(export_service, 'ensure_job_exports', cancel)

    with pytest.raises(asyncio.CancelledError):
        await export_service.run_job_export(job.job_id, ExportFormat.CSV)

    assert job.export_status == ExportStatus.CANCELLED
    assert job.export_error_message == 'Export cancelled'
