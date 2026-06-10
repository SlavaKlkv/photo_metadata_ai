import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from uuid import UUID

import structlog

from app.core.runtime import get_runtime_directories
from app.schemas.job import ProcessingJob
from app.storage.constants import JOB_STORAGE_SCHEMA_VERSION

logger = structlog.get_logger(__name__)


class JobStorage:
    """
    SQLite-backed storage для хранения состояния desktop jobs.
    """

    def __init__(self, db_path: Path | None = None):
        self._jobs: dict[UUID, ProcessingJob] = {}
        self._db_path = db_path
        self._initialized = False
        self._lock = Lock()

    async def initialize(self) -> None:
        """
        Инициализирует БД и применяет миграции схемы.
        """
        with self._lock:
            self._ensure_initialized()

    async def create_job(self, job: ProcessingJob) -> ProcessingJob:
        with self._lock:
            self._ensure_initialized()
            self._jobs[job.job_id] = job
            self._persist_job(job)

        logger.debug(
            'job_saved_to_storage',
            job_id=str(job.job_id),
            status=job.status,
        )
        return job

    async def get_job(self, job_id: UUID) -> ProcessingJob | None:
        with self._lock:
            self._ensure_initialized()

            job = self._jobs.get(job_id)
            if job is None:
                job = self._load_job(job_id)
                if job is not None:
                    self._jobs[job.job_id] = job

        logger.debug(
            'job_loaded_from_storage',
            job_id=str(job_id),
            found=job is not None,
        )
        return job

    async def update_job(self, job: ProcessingJob) -> ProcessingJob:
        with self._lock:
            self._ensure_initialized()
            self._jobs[job.job_id] = job
            self._persist_job(job)

        logger.debug(
            'job_updated_in_storage',
            job_id=str(job.job_id),
            status=job.status,
        )
        return job

    async def list_jobs(self) -> list[ProcessingJob]:
        with self._lock:
            self._ensure_initialized()
            self._load_all_jobs()
            jobs = sorted(
                self._jobs.values(),
                key=lambda job: job.created_at,
                reverse=True,
            )

        logger.debug(
            'jobs_listed_from_storage',
            jobs_count=len(jobs),
        )
        return jobs

    def reset_for_tests(self) -> None:
        with self._lock:
            self._jobs.clear()
            self._initialized = False

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return

        db_path = self._resolve_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)

        with self._connect() as connection:
            _set_sqlite_pragmas(connection)
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied_versions = {
                row[0]
                for row in connection.execute(
                    'SELECT version FROM schema_migrations'
                ).fetchall()
            }

            if 1 not in applied_versions:
                self._apply_v1_migration(connection)

            connection.commit()

        self._initialized = True
        logger.info(
            'job_storage_initialized',
            db_path=str(db_path),
            schema_version=JOB_STORAGE_SCHEMA_VERSION,
        )

    def _apply_v1_migration(
        self,
        connection: sqlite3.Connection,
    ) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, applied_at)
            VALUES (?, ?)
            """,
            (1, _utc_now_iso()),
        )

    def _persist_job(self, job: ProcessingJob) -> None:
        payload_json = job.model_dump_json()
        connection = self._connect()

        try:
            connection.execute(
                """
                INSERT INTO jobs (
                    job_id,
                    status,
                    created_at,
                    updated_at,
                    payload_json
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    payload_json = excluded.payload_json
                """,
                (
                    str(job.job_id),
                    job.status.value,
                    job.created_at.isoformat(),
                    _utc_now_iso(),
                    payload_json,
                ),
            )
            connection.commit()
        finally:
            connection.close()

    def _load_job(self, job_id: UUID) -> ProcessingJob | None:
        connection = self._connect()

        try:
            row = connection.execute(
                """
                SELECT payload_json
                FROM jobs
                WHERE job_id = ?
                """,
                (str(job_id),),
            ).fetchone()
        finally:
            connection.close()

        if row is None:
            return None

        return _parse_job_payload(row['payload_json'])

    def _load_all_jobs(self) -> None:
        connection = self._connect()

        try:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM jobs
                ORDER BY created_at DESC
                """
            ).fetchall()
        finally:
            connection.close()

        for row in rows:
            job = _parse_job_payload(row['payload_json'])
            if job is not None:
                self._jobs[job.job_id] = job

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self._resolve_db_path(),
            timeout=5,
        )
        connection.row_factory = sqlite3.Row
        return connection

    def _resolve_db_path(self) -> Path:
        if self._db_path is not None:
            return self._db_path

        return get_runtime_directories().job_storage_db_path


def _set_sqlite_pragmas(connection: sqlite3.Connection) -> None:
    connection.execute('PRAGMA journal_mode=WAL')
    connection.execute('PRAGMA foreign_keys=ON')


def _parse_job_payload(payload_json: str) -> ProcessingJob | None:
    try:
        return ProcessingJob.model_validate_json(payload_json)
    except Exception as error:
        logger.exception(
            'job_storage_payload_parse_failed',
            error=str(error),
        )
        return None


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


storage = JobStorage()
