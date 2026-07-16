import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.config import settings
from app.core.enums import FileStatus, JobStatus
from app.core.runtime import reset_runtime_directories_cache
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.storage import desktop_settings, marketplace_credentials
from app.storage.jobs import JobStorage


def _job(*, created_at: datetime | None = None) -> ProcessingJob:
    return ProcessingJob(
        created_at=created_at or datetime.now(UTC),
        files=[
            ProcessingJobFile(
                filename='photo.jpg',
                original_filename='photo.jpg',
            )
        ],
    )


@pytest.mark.asyncio
async def test_job_storage_persists_and_reloads_job(tmp_path: Path):
    db_path = tmp_path / 'jobs.sqlite'
    first_storage = JobStorage(db_path)
    job = _job()
    job.files[0].status = FileStatus.COMPLETED
    job.files[0].title = 'Persisted title'

    await first_storage.create_job(job)

    second_storage = JobStorage(db_path)
    reloaded = await second_storage.get_job(job.job_id)

    assert reloaded is not None
    assert reloaded.job_id == job.job_id
    assert reloaded.files[0].status == FileStatus.COMPLETED
    assert reloaded.files[0].title == 'Persisted title'

    with closing(sqlite3.connect(db_path)) as connection:
        migration_versions = connection.execute(
            'SELECT version FROM schema_migrations'
        ).fetchall()

    assert migration_versions == [(1,)]


@pytest.mark.asyncio
async def test_job_storage_update_is_visible_to_new_instance(tmp_path: Path):
    db_path = tmp_path / 'jobs.sqlite'
    first_storage = JobStorage(db_path)
    job = _job()
    await first_storage.create_job(job)

    job.status = JobStatus.COMPLETED
    job.files[0].selected_for_export = False
    await first_storage.update_job(job)

    reloaded = await JobStorage(db_path).get_job(job.job_id)

    assert reloaded is not None
    assert reloaded.status == JobStatus.COMPLETED
    assert reloaded.files[0].selected_for_export is False


@pytest.mark.asyncio
async def test_job_storage_lists_jobs_newest_first(tmp_path: Path):
    storage = JobStorage(tmp_path / 'jobs.sqlite')
    older = _job(created_at=datetime.now(UTC) - timedelta(days=1))
    newer = _job(created_at=datetime.now(UTC))

    await storage.create_job(older)
    await storage.create_job(newer)

    assert [job.job_id for job in await storage.list_jobs()] == [
        newer.job_id,
        older.job_id,
    ]


@pytest.mark.asyncio
async def test_job_storage_returns_none_for_missing_and_corrupt_payload(
    tmp_path: Path,
):
    db_path = tmp_path / 'jobs.sqlite'
    storage = JobStorage(db_path)
    await storage.initialize()

    assert await storage.get_job(uuid4()) is None

    corrupt_job_id = uuid4()
    with closing(sqlite3.connect(db_path)) as connection:
        connection.execute(
            """
            INSERT INTO jobs (
                job_id, status, created_at, updated_at, payload_json
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                str(corrupt_job_id),
                JobStatus.QUEUED.value,
                datetime.now(UTC).isoformat(),
                datetime.now(UTC).isoformat(),
                '{invalid-json',
            ),
        )
        connection.commit()

    assert await storage.get_job(corrupt_job_id) is None
    assert await storage.list_jobs() == []


def test_desktop_settings_round_trip_and_invalid_payload(tmp_path: Path):
    path = desktop_settings.write_desktop_settings_payload(
        {'selected_provider': 'gemini'}
    )

    assert path.parent == tmp_path
    assert desktop_settings.load_desktop_settings_payload() == {
        'selected_provider': 'gemini'
    }

    path.write_text('[1, 2, 3]', encoding='utf-8')
    assert desktop_settings.load_desktop_settings_payload() == {}

    path.write_text('{invalid-json', encoding='utf-8')
    assert desktop_settings.load_desktop_settings_payload() == {}


def test_desktop_settings_migrates_legacy_file(monkeypatch, tmp_path: Path):
    legacy_root = tmp_path / 'legacy'
    desktop_root = tmp_path / 'desktop'
    legacy_root.mkdir()
    legacy_path = legacy_root / 'desktop_settings.json'
    legacy_path.write_text(
        json.dumps({'selected_provider': 'ollama'}),
        encoding='utf-8',
    )
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', legacy_root)
    monkeypatch.setattr(settings, 'DESKTOP_STORAGE_DIR', desktop_root)
    reset_runtime_directories_cache()

    payload = desktop_settings.load_desktop_settings_payload()

    assert payload == {'selected_provider': 'ollama'}
    assert not legacy_path.exists()
    assert (desktop_root / 'desktop_settings.json').is_file()


def test_marketplace_credentials_round_trip_filters_invalid_records(
    tmp_path: Path,
):
    path = marketplace_credentials.write_marketplace_credentials_records(
        {
            'shutterstock': {'secret': 'secret-value'},
            'invalid': {'secret': 'keep-as-record'},
        }
    )

    path.write_text(
        json.dumps(
            {
                'shutterstock': {'secret': 'secret-value'},
                'invalid': 'not-a-record',
            }
        ),
        encoding='utf-8',
    )

    assert marketplace_credentials.load_marketplace_credentials_records() == {
        'shutterstock': {'secret': 'secret-value'}
    }
    assert path.stat().st_mode & 0o777 == 0o600

    path.write_text('{invalid-json', encoding='utf-8')
    assert marketplace_credentials.load_marketplace_credentials_records() == {}


def test_marketplace_credentials_migrates_legacy_file(
    monkeypatch,
    tmp_path: Path,
):
    legacy_root = tmp_path / 'legacy'
    desktop_root = tmp_path / 'desktop'
    legacy_root.mkdir()
    legacy_path = legacy_root / 'marketplace_credentials.json'
    legacy_path.write_text(
        json.dumps({'getty_images': {'api_key': 'secret'}}),
        encoding='utf-8',
    )
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', legacy_root)
    monkeypatch.setattr(settings, 'DESKTOP_STORAGE_DIR', desktop_root)
    reset_runtime_directories_cache()

    payload = marketplace_credentials.load_marketplace_credentials_records()

    assert payload == {'getty_images': {'api_key': 'secret'}}
    assert (desktop_root / 'marketplace_credentials.json').is_file()
