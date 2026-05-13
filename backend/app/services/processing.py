from uuid import UUID

from app.schemas.job import (
    FileStatus,
    JobStatus,
)
from app.services.storage import storage


async def process_job(job_id: UUID) -> None:
    """
    Выполняет фоновую обработку задачи и обновляет статусы файлов.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.status = JobStatus.PROCESSING

    for file in job.files:
        file.status = FileStatus.PROCESSING

    await storage.update_job(job)

    for file in job.files:
        file.status = FileStatus.COMPLETED

    job.status = JobStatus.COMPLETED
    await storage.update_job(job)
