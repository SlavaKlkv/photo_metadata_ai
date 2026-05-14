import asyncio
from uuid import UUID

from app.core.constants import MAX_CONCURRENT_AI_REQUESTS
from app.schemas.job import (
    FileStatus,
    JobStatus,
    ProcessingJobFile,
)
from app.services.ai_provider import (
    BaseAIProvider,
    get_ai_provider,
)
from app.services.metadata_embedding import get_upload_file_path
from app.services.storage import storage

ai_requests_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI_REQUESTS)


async def _process_file(
    file: ProcessingJobFile,
    ai_provider: BaseAIProvider,
) -> None:
    """
    Обрабатывает один файл с ограничением числа одновременных AI-запросов.
    """
    async with ai_requests_semaphore:
        try:
            file.status = FileStatus.PROCESSING

            metadata = await ai_provider.generate_metadata(
                get_upload_file_path(file.filename),
            )

            file.title = metadata.title
            file.description = metadata.description
            file.keywords = metadata.keywords

            file.status = FileStatus.COMPLETED

        except Exception as error:
            file.status = FileStatus.FAILED
            file.error_message = str(error)


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

    ai_provider = get_ai_provider()

    await asyncio.gather(
        *[
            _process_file(file, ai_provider)
            for file in job.files
        ],
    )

    if any(file.status == FileStatus.FAILED for file in job.files):
        job.status = JobStatus.FAILED
    else:
        job.status = JobStatus.COMPLETED

    await storage.update_job(job)
