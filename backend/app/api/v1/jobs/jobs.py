from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.core.enums import (
    ExportFormat,
    ExportStatus,
    JobStatus,
    StockPlatform,
)
from app.schemas.job import (
    CleanupJobResult,
    FileStatus,
    MetadataSnapshot,
    ProcessingJob,
    ProcessingJobExportStatus,
    ProcessingJobFile,
    ProcessingJobFileStatus,
    ProcessingJobMetadataResult,
    ProcessingJobMetadataResults,
    ProcessingJobStatus,
    RegenerateAttempt,
    RegenerateFileMetadataRequest,
    RegenerateFileMetadataResponse,
    StockFieldOptions,
    UpdateProcessingJobMetadataRequest,
    UpdateProcessingJobSettingsRequest,
)
from app.services.ai_provider import get_ai_provider
from app.services.cleanup import cleanup_job_temp_files
from app.services.export.export import (
    generate_job_export,
    invalidate_job_export_cache,
    load_stored_job_export,
    run_job_export,
)
from app.services.processing import (
    apply_generated_metadata_to_file,
    cancel_job_processing,
    process_job,
    regenerate_metadata_for_file,
    retry_failed_files,
)
from app.services.stock_metadata import (
    get_effective_categories,
    get_stock_field_options,
    validate_file_metadata_for_stock,
)
from app.services.storage import storage
from app.services.upload import UploadValidationError, save_upload_file

router = APIRouter(
    prefix='/jobs',
    tags=['jobs'],
)


def _build_metadata_result(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> ProcessingJobMetadataResult:
    """
    Собирает stock-aware результат metadata для preview и PATCH-ответов.
    """
    mapped_categories = get_effective_categories(file, stock_platform)
    mapped_category_2 = (
        mapped_categories[1] if len(mapped_categories) > 1 else None
    )

    return ProcessingJobMetadataResult(
        file_id=file.file_id,
        filename=file.filename,
        original_filename=file.original_filename,
        status=file.status,
        title=file.title,
        description=file.description,
        keywords=file.keywords,
        categories=mapped_categories,
        category_2=mapped_category_2,
        license_type=file.license_type,
        location_metadata=file.location_metadata,
        editorial_date=file.editorial_date,
        is_editorial=file.is_editorial,
        editorial_caption=file.editorial_caption,
        has_people=file.has_people,
        people_count=file.people_count,
        model_release_available=file.model_release_available,
        releases=file.releases,
        ai_generated_content_disclosure=(file.ai_generated_content_disclosure),
        is_illustration=file.is_illustration,
        mature_content=file.mature_content,
        iptc_embedded_metadata=file.iptc_embedded_metadata,
        error_message=file.error_message,
        validation=validate_file_metadata_for_stock(
            file,
            stock_platform,
        ),
    )


def _build_metadata_snapshot(file: ProcessingJobFile) -> MetadataSnapshot:
    """
    Собирает snapshot текущих metadata для истории regenerate attempts.
    """
    return MetadataSnapshot(
        title=file.title,
        description=file.description,
        keywords=list(file.keywords),
        categories=list(file.categories),
        category_2=file.category_2,
        license_type=file.license_type,
        location_metadata=file.location_metadata,
        editorial_date=file.editorial_date,
        is_editorial=file.is_editorial,
        editorial_caption=file.editorial_caption,
        has_people=file.has_people,
        people_count=file.people_count,
        model_release_available=file.model_release_available,
        releases=list(file.releases),
        ai_generated_content_disclosure=(file.ai_generated_content_disclosure),
        is_illustration=file.is_illustration,
        mature_content=file.mature_content,
        iptc_embedded_metadata=file.iptc_embedded_metadata,
    )


# --- загрузка и обработка ---


@router.post('/upload', response_model=ProcessingJob)
async def upload_photos(
    files: list[UploadFile] = File(...),
    shooting_context: str | None = Form(None),
):
    """
    Загружает несколько JPEG-файлов и создает задачу обработки.
    """
    job_files = []

    for file in files:
        original_filename = file.filename or 'uploaded_file'

        try:
            saved_filename = await save_upload_file(file)
            job_files.append(
                ProcessingJobFile(
                    filename=saved_filename,
                    original_filename=original_filename,
                )
            )
        except UploadValidationError as error:
            job_files.append(
                ProcessingJobFile(
                    filename=original_filename,
                    original_filename=original_filename,
                    status=FileStatus.FAILED,
                    error_message=str(error),
                )
            )

    job = ProcessingJob(
        files=job_files,
        shooting_context=shooting_context,
    )

    created_job = await storage.create_job(job)

    return created_job


@router.patch('/{job_id}/settings', response_model=ProcessingJob)
async def update_job_settings(
    job_id: UUID,
    payload: UpdateProcessingJobSettingsRequest,
):
    """
    Обновляет настройки задачи перед запуском обработки.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    for field_name in payload.model_fields_set:
        setattr(job, field_name, getattr(payload, field_name))

    if payload.model_fields_set:
        invalidate_job_export_cache(job)

    return await storage.update_job(job)


@router.get(
    '/stock-options/{stock_platform}',
    response_model=StockFieldOptions,
)
async def get_stock_options(stock_platform: StockPlatform):
    """
    Возвращает допустимые значения категорий и license_type для стока.
    """
    return get_stock_field_options(stock_platform)


@router.post('/{job_id}/process', response_model=ProcessingJob)
async def start_job_processing(
    job_id: UUID,
    background_tasks: BackgroundTasks,
):
    """
    Запускает обработку задачи после загрузки файлов и настройки параметров.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    queued_files = [
        file for file in job.files if file.status == FileStatus.QUEUED
    ]

    if not queued_files:
        raise HTTPException(
            status_code=400,
            detail='No valid JPEG files to process',
        )

    if job.ai_provider is None:
        raise HTTPException(
            status_code=400,
            detail='AI provider must be selected before processing',
        )

    if job.status != JobStatus.QUEUED:
        raise HTTPException(
            status_code=400,
            detail='Job processing has already been started or finished',
        )

    job.status = JobStatus.PROCESSING
    await storage.update_job(job)

    background_tasks.add_task(process_job, job.job_id)

    return job


@router.post('/{job_id}/cancel', response_model=ProcessingJob)
async def cancel_job(job_id: UUID):
    """
    Останавливает дальнейшую обработку задачи.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    await cancel_job_processing(job.job_id)

    cancelled_job = await storage.get_job(job.job_id)

    if cancelled_job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    return cancelled_job


@router.post('/{job_id}/cleanup', response_model=CleanupJobResult)
async def cleanup_job(job_id: UUID):
    """
    Очищает временные файлы задачи по запросу фронтенда.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    deleted_files, deleted_directories = await run_in_threadpool(
        cleanup_job_temp_files,
        job,
    )

    return CleanupJobResult(
        job_id=job.job_id,
        deleted_files=deleted_files,
        deleted_directories=deleted_directories,
    )


@router.post(
    '/{job_id}/files/{file_id}/regenerate',
    response_model=RegenerateFileMetadataResponse,
)
async def regenerate_file_metadata(
    job_id: UUID,
    file_id: UUID,
    payload: RegenerateFileMetadataRequest | None = None,
):
    """
    Регенерирует metadata для одного файла на этапе review.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    if job.status == JobStatus.PROCESSING:
        raise HTTPException(
            status_code=409,
            detail=(
                'Regenerate is unavailable while batch processing is running'
            ),
        )

    job_file: ProcessingJobFile | None = None
    for candidate in job.files:
        if candidate.file_id == file_id:
            job_file = candidate
            break

    if job_file is None:
        raise HTTPException(
            status_code=404,
            detail='File not found',
        )

    if job_file.status != FileStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail='Regenerate is available only for completed files',
        )

    payload = payload or RegenerateFileMetadataRequest()
    resolved_shooting_context = (
        payload.shooting_context
        if payload.shooting_context is not None
        else job.shooting_context
    )
    resolved_stock_platform = (
        payload.stock_platform
        or job.stock_platform
        or StockPlatform.SHUTTERSTOCK
    )
    resolved_ai_provider = payload.ai_provider or job.ai_provider

    if resolved_ai_provider is None:
        raise HTTPException(
            status_code=400,
            detail='AI provider must be selected before regenerate',
        )

    previous_metadata = _build_metadata_snapshot(job_file)
    ai_provider = get_ai_provider(resolved_ai_provider)
    regenerated_metadata = await regenerate_metadata_for_file(
        job_file,
        ai_provider,
        job.job_id,
        resolved_shooting_context,
    )
    apply_generated_metadata_to_file(job_file, regenerated_metadata)
    job_file.status = FileStatus.COMPLETED

    regenerated_snapshot = _build_metadata_snapshot(job_file)
    regenerate_attempt = RegenerateAttempt(
        shooting_context=resolved_shooting_context,
        stock_platform=resolved_stock_platform,
        ai_provider=resolved_ai_provider,
        previous_metadata=previous_metadata,
        regenerated_metadata=regenerated_snapshot,
    )
    job_file.regenerate_attempts.append(regenerate_attempt)

    await storage.update_job(job)

    return RegenerateFileMetadataResponse(
        job_id=job.job_id,
        file_id=job_file.file_id,
        attempt_id=regenerate_attempt.attempt_id,
        metadata=_build_metadata_result(job_file, resolved_stock_platform),
        previous_metadata=previous_metadata,
    )


@router.post('/{job_id}/retry-failed', response_model=ProcessingJob)
async def retry_failed_job_files(
    job_id: UUID,
    background_tasks: BackgroundTasks,
):
    """
    Перезапускает обработку только failed файлов в задаче.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    failed_files = [
        file for file in job.files if file.status == FileStatus.FAILED
    ]

    if not failed_files:
        raise HTTPException(
            status_code=400,
            detail='No failed files to retry',
        )

    background_tasks.add_task(retry_failed_files, job.job_id)

    return job


# --- статус, результат ---


@router.get('/{job_id}', response_model=ProcessingJob)
async def get_job(job_id: UUID):
    """
    Возвращает полную информацию о задаче обработки.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    return job


@router.get('/{job_id}/status', response_model=ProcessingJobStatus)
async def get_job_status(job_id: UUID):
    """
    Возвращает текущий статус обработки задачи и ее файлов.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    return ProcessingJobStatus(
        job_id=job.job_id,
        status=job.status,
        files=[
            # Polling-ответ включает только поля для обновления прогресса
            # в UI и отображения ошибок отдельных файлов.
            ProcessingJobFileStatus(
                file_id=file.file_id,
                filename=file.original_filename,
                original_filename=file.original_filename,
                status=file.status,
                error_message=file.error_message,
            )
            for file in job.files
        ],
    )


@router.get('/{job_id}/results', response_model=ProcessingJobMetadataResults)
async def get_job_results(job_id: UUID):
    """
    Возвращает preview-результаты метаданных для задачи.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK

    return ProcessingJobMetadataResults(
        job_id=job.job_id,
        status=job.status,
        results=[
            _build_metadata_result(file, stock_platform) for file in job.files
        ],
    )


# --- редактирование метаданных ---


@router.patch(
    '/{job_id}/files/{file_id}/metadata',
    response_model=ProcessingJobMetadataResult,
)
async def update_file_metadata(
    job_id: UUID,
    file_id: UUID,
    payload: UpdateProcessingJobMetadataRequest,
):
    """
    Обновляет редактируемые поля метаданных одного файла в задаче.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    job_file: ProcessingJobFile | None = None
    for candidate in job.files:
        if candidate.file_id == file_id:
            job_file = candidate
            break

    if job_file is None:
        raise HTTPException(
            status_code=404,
            detail='File not found',
        )

    # PATCH обновляет только поля, которые прислал фронтенд.
    if 'title' in payload.model_fields_set:
        job_file.title = payload.title
    if 'description' in payload.model_fields_set:
        job_file.description = payload.description
    if 'keywords' in payload.model_fields_set:
        job_file.keywords = payload.keywords or []
    if 'categories' in payload.model_fields_set:
        job_file.categories = payload.categories or []
    if 'releases' in payload.model_fields_set:
        job_file.releases = payload.releases or []
    if 'category_2' in payload.model_fields_set:
        job_file.category_2 = payload.category_2
    if 'license_type' in payload.model_fields_set:
        job_file.license_type = payload.license_type
    if 'location_metadata' in payload.model_fields_set:
        job_file.location_metadata = payload.location_metadata
    if 'editorial_date' in payload.model_fields_set:
        job_file.editorial_date = payload.editorial_date
    if 'is_editorial' in payload.model_fields_set:
        job_file.is_editorial = bool(payload.is_editorial)
    if 'editorial_caption' in payload.model_fields_set:
        job_file.editorial_caption = payload.editorial_caption
    if 'has_people' in payload.model_fields_set:
        job_file.has_people = payload.has_people
    if 'people_count' in payload.model_fields_set:
        job_file.people_count = payload.people_count
    if 'model_release_available' in payload.model_fields_set:
        job_file.model_release_available = payload.model_release_available
    if 'ai_generated_content_disclosure' in payload.model_fields_set:
        job_file.ai_generated_content_disclosure = bool(
            payload.ai_generated_content_disclosure
        )
    if 'is_illustration' in payload.model_fields_set:
        job_file.is_illustration = payload.is_illustration
    if 'mature_content' in payload.model_fields_set:
        job_file.mature_content = payload.mature_content
    if 'iptc_embedded_metadata' in payload.model_fields_set:
        job_file.iptc_embedded_metadata = bool(payload.iptc_embedded_metadata)

    if payload.model_fields_set:
        invalidate_job_export_cache(job)

    await storage.update_job(job)

    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK

    return _build_metadata_result(job_file, stock_platform)


# --- экспорт ---


@router.post(
    '/{job_id}/export/{export_format}',
    response_model=ProcessingJobExportStatus,
)
async def start_job_export(
    job_id: UUID,
    export_format: ExportFormat,
    background_tasks: BackgroundTasks,
):
    """
    Запускает подготовку экспорта задачи в выбранном формате.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    completed_files = [
        file for file in job.files if file.status == FileStatus.COMPLETED
    ]

    if not completed_files:
        raise HTTPException(
            status_code=400,
            detail='No completed files available for export',
        )

    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK
    validation_errors: list[dict[str, object]] = []

    for file in completed_files:
        validation_result = validate_file_metadata_for_stock(
            file,
            stock_platform,
        )

        if validation_result.errors:
            validation_errors.append(
                {
                    'file_id': str(file.file_id),
                    'filename': file.original_filename,
                    'errors': [
                        issue.model_dump()
                        for issue in validation_result.errors
                    ],
                }
            )

    if validation_errors:
        raise HTTPException(
            status_code=400,
            detail={
                'message': (
                    'Export is blocked because metadata has validation errors.'
                ),
                'stock_platform': stock_platform.value,
                'files': validation_errors,
            },
        )

    job.export_status = ExportStatus.QUEUED
    job.export_progress = 0
    job.export_format = export_format
    job.export_error_message = None
    await storage.update_job(job)

    background_tasks.add_task(run_job_export, job.job_id, export_format)

    return ProcessingJobExportStatus(
        job_id=job.job_id,
        export_status=job.export_status,
        export_progress=job.export_progress,
        export_format=job.export_format,
        export_error_message=job.export_error_message,
    )


@router.get(
    '/{job_id}/export/status',
    response_model=ProcessingJobExportStatus,
)
async def get_job_export_status(job_id: UUID):
    """
    Возвращает текущий статус подготовки экспорта задачи.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    return ProcessingJobExportStatus(
        job_id=job.job_id,
        export_status=job.export_status,
        export_progress=job.export_progress,
        export_format=job.export_format,
        export_error_message=job.export_error_message,
    )


@router.get('/{job_id}/export/{export_format}')
async def export_job(
    job_id: UUID,
    export_format: ExportFormat,
):
    """
    Возвращает экспорт задачи в выбранном формате.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    try:
        stored_export = load_stored_job_export(job, export_format)

        if stored_export is None:
            content, filename, media_type = generate_job_export(
                job,
                export_format,
            )
        else:
            content, filename, media_type = stored_export
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    return Response(
        content=content,
        media_type=media_type,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
        },
    )
