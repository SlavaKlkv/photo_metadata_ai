import asyncio
from uuid import UUID

import structlog
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.enums import AIProvider, MetadataFieldSource, StockPlatform
from app.schemas.job import (
    FileStatus,
    JobStatus,
    ProcessingJobFile,
)
from app.services.ai.ai_fallback import (
    FallbackAttempt,
    FallbackMetadataResult,
    generate_metadata_with_fallback,
    validate_primary_provider_configuration,
)
from app.services.ai.ai_provider import AIMetadataResponse
from app.services.desktop.app_settings import resolve_effective_ai_settings
from app.services.image_preprocessing import resize_image_for_ai
from app.services.metadata.metadata_embedding import get_upload_file_path
from app.services.metadata.stock_autofix import apply_stock_metadata_autofixes
from app.services.processing.constants import MAX_CONCURRENT_AI_REQUESTS
from app.services.task_manager import job_task_manager
from app.storage.jobs import storage

ai_requests_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI_REQUESTS)
logger = structlog.get_logger(__name__)


async def regenerate_metadata_for_file(
    file: ProcessingJobFile,
    selected_provider: AIProvider,
    job_id: UUID,
    shooting_context: str | None,
    stock_platform: StockPlatform | None,
    file_number: int | None = None,
) -> FallbackMetadataResult:
    """
    Генерирует новые metadata для одного файла (без запуска batch processing)
    с общим лимитом параллельных AI-запросов.
    """
    async with ai_requests_semaphore:
        fallback_result = await _generate_metadata_for_file(
            file,
            selected_provider,
            job_id,
            shooting_context,
            stock_platform=stock_platform,
            file_number=file_number,
        )
        logger.info(
            'file_metadata_provider_resolved',
            job_id=str(job_id),
            file_id=str(file.file_id),
            file_number=file_number,
            provider=fallback_result.provider,
            model=fallback_result.model,
        )
        return fallback_result


def apply_generated_metadata_to_file(
    file: ProcessingJobFile,
    metadata: AIMetadataResponse,
    stock_platform: StockPlatform | None = None,
) -> None:
    """
    Применяет сгенерированные metadata к объекту файла.
    """
    file.title = metadata.title
    file.description = metadata.description
    file.keywords = metadata.keywords
    file.categories = metadata.categories
    file.category_2 = metadata.category_2
    file.license_type = metadata.license_type
    file.location_metadata = metadata.location_metadata
    file.location_sublocation = metadata.location_sublocation
    file.location_city = metadata.location_city
    file.location_province_state = metadata.location_province_state
    file.location_country = metadata.location_country
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
    file.prompt_version = metadata.prompt_version
    file.prompt_language = metadata.prompt_language
    file.error_message = None
    _mark_generated_field_sources(file)
    apply_stock_metadata_autofixes(file, stock_platform)


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

    try:
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
    except asyncio.CancelledError:
        await _mark_job_as_cancelled(job.job_id)
        logger.info(
            'job_processing_cancelled_by_task',
            job_id=str(job.job_id),
        )
        raise

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


def _mark_generated_field_sources(file: ProcessingJobFile) -> None:
    generated_fields = [
        'title',
        'description',
        'keywords',
        'categories',
        'category_2',
        'license_type',
        'location_metadata',
        'editorial_date',
        'is_editorial',
        'editorial_caption',
        'has_people',
        'people_count',
        'model_release_available',
        'releases',
        'ai_generated_content_disclosure',
        'is_illustration',
        'mature_content',
    ]

    for field_name in generated_fields:
        file.field_sources[field_name] = MetadataFieldSource.GENERATED


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

    try:
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
    except asyncio.CancelledError:
        await _mark_job_as_cancelled(job.job_id)
        logger.info(
            'retry_failed_files_cancelled_by_task',
            job_id=str(job.job_id),
        )
        raise

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

    await _mark_job_as_cancelled(job.job_id)


async def cancel_and_reset_job(job_id: UUID) -> None:
    """
    Отменяет обработку и возвращает задачу в состояние «до старта».

    Порядок важен: сначала пометка cancelled — по ней фоновый пайплайн сам
    выходит из цикла; затем ожидание фактической остановки задачи; и только
    после этого сброс, который иначе мог бы быть затёрт живым обработчиком.
    """
    await cancel_job_processing(job_id)
    await job_task_manager.cancel_and_wait(job_id)
    await _reset_job_to_queued(job_id)


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

            fallback_result = await _generate_metadata_for_file(
                file,
                selected_provider,
                job_id,
                shooting_context,
                stock_platform=stock_platform,
                file_number=file_number,
            )
            metadata = fallback_result.metadata
            file.effective_ai_provider = fallback_result.provider
            file.effective_ai_model = fallback_result.model
            await _record_effective_ai_provider(
                job_id,
                fallback_result.provider,
                fallback_result.model,
            )

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

            apply_generated_metadata_to_file(file, metadata, stock_platform)

            file.status = FileStatus.COMPLETED
            logger.info(
                'file_processing_completed',
                job_id=str(job_id),
                file_id=str(file.file_id),
                file_number=file_number,
                filename=file.original_filename,
            )

        except asyncio.CancelledError:
            file.status = FileStatus.CANCELLED
            logger.info(
                'file_processing_cancelled_by_task',
                job_id=str(job_id),
                file_id=str(file.file_id),
                file_number=file_number,
                filename=file.original_filename,
            )
            raise
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


async def _generate_metadata_for_file(
    file: ProcessingJobFile,
    selected_provider: AIProvider,
    job_id: UUID,
    shooting_context: str | None,
    stock_platform: StockPlatform | None,
    file_number: int | None = None,
) -> FallbackMetadataResult:
    source_image_path = get_upload_file_path(file.filename)
    preprocessed_image_path = await run_in_threadpool(
        resize_image_for_ai,
        source_image_path,
        job_id=job_id,
        file_id=file.file_id,
        max_long_side_px=settings.AI_RESIZE_LONG_SIDE_PX,
        jpeg_quality=settings.AI_JPEG_QUALITY,
    )

    async def record_attempt_started(attempt: FallbackAttempt) -> None:
        await _record_effective_ai_provider_attempt(
            job_id,
            file,
            attempt.provider,
            attempt.model,
        )

    return await generate_metadata_with_fallback(
        selected_provider=selected_provider,
        image_path=preprocessed_image_path,
        shooting_context=shooting_context,
        file_number=file_number,
        stock_platform=stock_platform,
        on_attempt_started=record_attempt_started,
    )


async def _record_effective_ai_provider_attempt(
    job_id: UUID,
    file: ProcessingJobFile,
    provider: AIProvider,
    model: str | None,
) -> None:
    file.effective_ai_provider = provider
    file.effective_ai_model = model

    job = await storage.get_job(job_id)

    if job is None:
        return

    stored_file = next(
        (
            candidate
            for candidate in job.files
            if candidate.file_id == file.file_id
        ),
        None,
    )

    if stored_file is not None:
        stored_file.effective_ai_provider = provider
        stored_file.effective_ai_model = model

    if (
        job.effective_ai_provider == provider
        and job.effective_ai_model == model
    ):
        await storage.update_job(job)
        return

    job.effective_ai_provider = provider
    job.effective_ai_model = model
    await storage.update_job(job)


async def _record_effective_ai_provider(
    job_id: UUID,
    provider: AIProvider,
    model: str | None,
) -> None:
    job = await storage.get_job(job_id)

    if job is None:
        return

    if (
        job.effective_ai_provider == provider
        and job.effective_ai_model == model
    ):
        return

    job.effective_ai_provider = provider
    job.effective_ai_model = model
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


async def _mark_job_as_cancelled(job_id: UUID) -> None:
    """
    Переводит задачу и все незавершённые файлы в cancelled.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.status = JobStatus.CANCELLED

    for file in job.files:
        if file.status in {FileStatus.QUEUED, FileStatus.PROCESSING}:
            file.status = FileStatus.CANCELLED

    logger.info(
        'job_marked_as_cancelled',
        job_id=str(job.job_id),
    )
    await storage.update_job(job)


async def _reset_job_to_queued(job_id: UUID) -> None:
    """
    Возвращает задачу в состояние «до старта обработки».

    Файлы пересобираются заново от идентифицирующих полей, поэтому частичные
    результаты отменённого прогона не остаются ни в одном metadata-поле.
    """
    job = await storage.get_job(job_id)

    if job is None:
        return

    job.status = JobStatus.QUEUED
    job.effective_ai_provider = None
    job.effective_ai_model = None
    job.files = [
        ProcessingJobFile(
            file_id=file.file_id,
            filename=file.filename,
            original_filename=file.original_filename,
        )
        for file in job.files
    ]

    logger.info(
        'job_reset_to_queued',
        job_id=str(job.job_id),
        files_count=len(job.files),
    )
    await storage.update_job(job)
