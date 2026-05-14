from uuid import UUID

from app.schemas.job import (
    FileStatus,
    JobStatus,
)
from app.services.ai_provider import get_ai_provider
from app.services.metadata_embedding import get_upload_file_path
from app.services.storage import storage


async def process_job(job_id: UUID) -> None:
    """
    Выполняет фоновую обработку задачи и обновляет статусы файлов.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.status = JobStatus.PROCESSING
    ai_provider = get_ai_provider()

    for file in job.files:
        file.status = FileStatus.PROCESSING

    await storage.update_job(job)

    for file in job.files:
        metadata = await ai_provider.generate_metadata(
            get_upload_file_path(file.filename),
        )

        file.title = metadata.title
        file.description = metadata.description
        file.keywords = metadata.keywords

        file.status = FileStatus.COMPLETED

    job.status = JobStatus.COMPLETED
    await storage.update_job(job)
