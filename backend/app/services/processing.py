import asyncio
from uuid import UUID

import structlog

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
logger = structlog.get_logger(__name__)


async def _process_file(
    file: ProcessingJobFile,
    ai_provider: BaseAIProvider,
    job_id: UUID,
    shooting_context: str | None,
    file_number: int | None = None,
) -> None:
    """
    Обрабатывает один файл с ограничением числа одновременных AI-запросов.
    """
    async with ai_requests_semaphore:
        logger.info(
            'file_processing_started',
            job_id=str(job_id),
            file_id=str(file.file_id),
            file_number=file_number,
            filename=file.original_filename,
        )
        try:
            if await _is_job_cancelled(job_id):
                file.status = FileStatus.CANCELLED
                logger.info(
                    'file_processing_cancelled',
                    job_id=str(job_id),
                    file_id=str(file.file_id),
                    file_number=file_number,
                    filename=file.original_filename,
                )
                return

            file.status = FileStatus.PROCESSING

            metadata = await ai_provider.generate_metadata(
                get_upload_file_path(file.filename),
                shooting_context=shooting_context,
                file_number=file_number,
            )

            if await _is_job_cancelled(job_id):
                file.status = FileStatus.CANCELLED
                logger.info(
                    'file_processing_cancelled',
                    job_id=str(job_id),
                    file_id=str(file.file_id),
                    file_number=file_number,
                    filename=file.original_filename,
                )
                return

            file.title = metadata.title
            file.description = metadata.description
            file.keywords = metadata.keywords

            file.status = FileStatus.COMPLETED
            logger.info(
                'file_processing_completed',
                job_id=str(job_id),
                file_id=str(file.file_id),
                file_number=file_number,
                filename=file.original_filename,
            )

        except Exception as error:
            file.status = FileStatus.FAILED
            file.error_message = str(error)
            logger.exception(
                'file_processing_failed',
                job_id=str(job_id),
                file_id=str(file.file_id),
                file_number=file_number,
                filename=file.original_filename,
                error=str(error),
            )


async def process_job(job_id: UUID) -> None:
    """
    Выполняет фоновую обработку задачи и обновляет статусы файлов.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return
    logger.info(
        'job_processing_started',
        job_id=str(job.job_id),
        files_count=len(job.files),
    )

    job.status = JobStatus.PROCESSING

    for file in job.files:
        file.status = FileStatus.PROCESSING

    await storage.update_job(job)

    try:
        ai_provider = get_ai_provider()
    except Exception as error:
        logger.exception(
            'ai_provider_initialization_failed',
            job_id=str(job.job_id),
            error=str(error),
        )
        await _mark_job_as_failed(job.job_id, error)
        return

    await asyncio.gather(
        *[
            _process_file(
                file,
                ai_provider,
                job.job_id,
                job.shooting_context,
                file_number=index,
            )
            for index, file in enumerate(job.files, start=1)
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

    logger.info(
        'job_processing_finished',
        job_id=str(job.job_id),
        status=job.status,
    )
    await storage.update_job(job)


async def retry_failed_files(job_id: UUID) -> None:
    """
    Повторно обрабатывает только файлы со статусом failed.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    failed_indexed_files = [
        (file_number, file)
        for file_number, file in enumerate(job.files, start=1)
        if file.status == FileStatus.FAILED
    ]

    if not failed_indexed_files:
        return
    logger.info(
        'retry_failed_files_started',
        job_id=str(job.job_id),
        failed_files_count=len(failed_indexed_files),
    )

    job.status = JobStatus.PROCESSING

    for _, file in failed_indexed_files:
        file.status = FileStatus.QUEUED
        file.error_message = None

    await storage.update_job(job)

    try:
        ai_provider = get_ai_provider()
    except Exception as error:
        logger.exception(
            'ai_provider_initialization_failed_on_retry',
            job_id=str(job.job_id),
            error=str(error),
        )
        await _mark_job_as_failed(job.job_id, error)
        return

    await asyncio.gather(
        *[
            _process_file(
                file,
                ai_provider,
                job.job_id,
                job.shooting_context,
                file_number=file_number,
            )
            for file_number, file in failed_indexed_files
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

    logger.info(
        'retry_failed_files_finished',
        job_id=str(job.job_id),
        status=job.status,
    )
    await storage.update_job(job)


async def cancel_job_processing(job_id: UUID) -> None:
    """
    Отменяет обработку задачи и pending/processing файлов.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return
    logger.info(
        'job_processing_cancel_requested',
        job_id=str(job.job_id),
    )

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


async def _mark_job_as_failed(job_id: UUID, error: Exception) -> None:
    """
    Переводит задачу и все незавершённые файлы в failed при ошибке пайплайна.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.status = JobStatus.FAILED
    error_message = str(error)

    for file in job.files:
        if file.status in {FileStatus.QUEUED, FileStatus.PROCESSING}:
            file.status = FileStatus.FAILED
            file.error_message = error_message
    logger.exception(
        'job_marked_as_failed',
        job_id=str(job.job_id),
        error=str(error),
    )
    await storage.update_job(job)
