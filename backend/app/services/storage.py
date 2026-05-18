from uuid import UUID

import structlog

from app.schemas.job import ProcessingJob

logger = structlog.get_logger(__name__)


class JobStorage:
    def __init__(self):
        self._jobs: dict[UUID, ProcessingJob] = {}

    async def create_job(self, job: ProcessingJob) -> ProcessingJob:
        self._jobs[job.job_id] = job
        logger.debug(
            'job_saved_to_storage',
            job_id=str(job.job_id),
            status=job.status,
        )
        return job

    async def get_job(self, job_id: UUID) -> ProcessingJob | None:
        job = self._jobs.get(job_id)
        logger.debug(
            'job_loaded_from_storage',
            job_id=str(job_id),
            found=job is not None,
        )
        return job

    async def update_job(self, job: ProcessingJob) -> ProcessingJob:
        self._jobs[job.job_id] = job
        logger.debug(
            'job_updated_in_storage',
            job_id=str(job.job_id),
            status=job.status,
        )
        return job

    async def list_jobs(self) -> list[ProcessingJob]:
        jobs = list(self._jobs.values())
        logger.debug(
            'jobs_listed_from_storage',
            jobs_count=len(jobs),
        )
        return jobs


# Глобальный экземпляр in-memory хранилища задач.
storage = JobStorage()
