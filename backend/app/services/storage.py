from uuid import UUID

from app.schemas.job import ProcessingJob


class JobStorage:
    def __init__(self):
        self._jobs: dict[UUID, ProcessingJob] = {}

    async def create_job(self, job: ProcessingJob) -> ProcessingJob:
        self._jobs[job.job_id] = job
        return job

    async def get_job(self, job_id: UUID) -> ProcessingJob | None:
        return self._jobs.get(job_id)

    async def update_job(self, job: ProcessingJob) -> ProcessingJob:
        self._jobs[job.job_id] = job
        return job

    async def list_jobs(self) -> list[ProcessingJob]:
        return list(self._jobs.values())


# Global in-memory storage instance
storage = JobStorage()
