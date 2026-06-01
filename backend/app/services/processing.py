import asyncio
from uuid import UUID

import structlog
from starlette.concurrency import run_in_threadpool

from app.core.constants import (
    DEFAULT_AI_RESIZE_LONG_SIDE_PX,
    MAX_CONCURRENT_AI_REQUESTS,
)
from app.core.enums import AIProvider, StockPlatform
from app.schemas.job import (
    FileStatus,
    JobStatus,
    ProcessingJobFile,
)
from app.services.ai_fallback import (
    generate_metadata_with_fallback,
    validate_primary_provider_configuration,
)
from app.services.app_settings import resolve_effective_ai_settings
from app.services.image_preprocessing import resize_image_for_ai
from app.services.metadata_embedding import get_upload_file_path
from app.services.storage import storage

ai_requests_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI_REQUESTS)
logger = structlog.get_logger(__name__)


async def _process_file(
    file: ProcessingJobFile,
    selected_provider: AIProvider,
    job_id: UUID,
    shooting_context: str | None,
    stock_platform: StockPlatform | None,
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

            source_image_path = get_upload_file_path(file.filename)
            preprocessed_image_path = await run_in_threadpool(
                resize_image_for_ai,
                source_image_path,
                job_id=job_id,
                file_id=file.file_id,
                max_long_side_px=DEFAULT_AI_RESIZE_LONG_SIDE_PX,
            )

            fallback_result = await generate_metadata_with_fallback(
                selected_provider=selected_provider,
                image_path=preprocessed_image_path,
                shooting_context=shooting_context,
                file_number=file_number,
                stock_platform=stock_platform,
            )
            metadata = fallback_result.metadata

            logger.info(
                'file_metadata_provider_resolved',
                job_id=str(job_id),
                file_id=str(file.file_id),
                file_number=file_number,
                provider=fallback_result.provider,
                model=fallback_result.model,
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
            file.categories = metadata.categories
            file.category_2 = metadata.category_2
            file.license_type = metadata.license_type
            file.location_metadata = metadata.location_metadata
            file.editorial_date = metadata.editorial_date
            file.is_editorial = metadata.is_editorial
            file.editorial_caption = metadata.editorial_caption
            file.has_people = metadata.has_people
            file.people_count = metadata.people_count
            file.model_release_available = metadata.model_release_available
            file.releases = metadata.releases
            file.ai_generated_content_disclosure = (
                metadata.ai_generated_content_disclosure
            )
            file.is_illustration = metadata.is_illustration
            file.mature_content = metadata.mature_content
            file.iptc_embedded_metadata = False

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
    queued_files = [
        file for file in job.files if file.status == FileStatus.QUEUED
    ]
    for file in queued_files:
        file.status = FileStatus.PROCESSING

    await storage.update_job(job)

    try:
        effective_ai_settings = resolve_effective_ai_settings(job.ai_provider)
        job.effective_ai_provider = effective_ai_settings.provider
        job.effective_ai_model = effective_ai_settings.model
        await storage.update_job(job)
        validate_primary_provider_configuration(
            effective_ai_settings.provider,
        )
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
                effective_ai_settings.provider,
                job.job_id,
                job.shooting_context,
                job.stock_platform,
                file_number=index,
            )
            for index, file in enumerate(queued_files, start=1)
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
        effective_ai_settings = resolve_effective_ai_settings(job.ai_provider)
        job.effective_ai_provider = effective_ai_settings.provider
        job.effective_ai_model = effective_ai_settings.model
        await storage.update_job(job)
        validate_primary_provider_configuration(
            effective_ai_settings.provider,
        )
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
                effective_ai_settings.provider,
                job.job_id,
                job.shooting_context,
                job.stock_platform,
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
