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
    job_id: UUID,
    shooting_context: str | None,
) -> None:
    """
    Обрабатывает один файл с ограничением числа одновременных AI-запросов.
    """
    async with ai_requests_semaphore:
        try:
            if await _is_job_cancelled(job_id):
                file.status = FileStatus.CANCELLED
                return

            file.status = FileStatus.PROCESSING

            metadata = await ai_provider.generate_metadata(
                get_upload_file_path(file.filename),
                shooting_context=shooting_context,
            )

            if await _is_job_cancelled(job_id):
                file.status = FileStatus.CANCELLED
                return

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
            _process_file(
                file,
                ai_provider,
                job.job_id,
                job.shooting_context,
            )
            for file in job.files
        ],
    )

    if job.status == JobStatus.CANCELLED:
        return

    if any(file.status == FileStatus.FAILED for file in job.files):
        job.status = JobStatus.FAILED
    elif any(file.status == FileStatus.CANCELLED for file in job.files):
        job.status = JobStatus.CANCELLED
    else:
        job.status = JobStatus.COMPLETED

    await storage.update_job(job)


async def retry_failed_files(job_id: UUID) -> None:
    """
    Повторно обрабатывает только файлы со статусом failed.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    failed_files = [
        file for file in job.files if file.status == FileStatus.FAILED
    ]

    if not failed_files:
        return

    job.status = JobStatus.PROCESSING

    for file in failed_files:
        file.status = FileStatus.QUEUED
        file.error_message = None

    await storage.update_job(job)

    ai_provider = get_ai_provider()

    await asyncio.gather(
        *[
            _process_file(
                file,
                ai_provider,
                job.job_id,
                job.shooting_context,
            )
            for file in failed_files
        ],
    )

    if job.status == JobStatus.CANCELLED:
        return

    if any(file.status == FileStatus.FAILED for file in job.files):
        job.status = JobStatus.FAILED
    elif any(file.status == FileStatus.CANCELLED for file in job.files):
        job.status = JobStatus.CANCELLED
    elif any(file.status == FileStatus.PROCESSING for file in job.files):
        job.status = JobStatus.PROCESSING
    else:
        job.status = JobStatus.COMPLETED

    await storage.update_job(job)


async def cancel_job_processing(job_id: UUID) -> None:
    """
    Отменяет обработку задачи и pending/processing файлов.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.status = JobStatus.CANCELLED

    for file in job.files:
        if file.status in {FileStatus.QUEUED, FileStatus.PROCESSING}:
            file.status = FileStatus.CANCELLED

    await storage.update_job(job)


async def _is_job_cancelled(job_id: UUID) -> bool:
    """
    Проверяет, была ли задача отменена во время фоновой обработки.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return True

    return job.status == JobStatus.CANCELLED
