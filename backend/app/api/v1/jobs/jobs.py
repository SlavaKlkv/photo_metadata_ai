from io import BytesIO
from pathlib import Path
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.core.enums import (
    ExportFormat,
    ExportStatus,
    JobStatus,
    MetadataFieldSource,
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
from app.services.app_settings import (
    get_desktop_settings,
    resolve_effective_ai_settings,
    update_desktop_settings,
)
from app.services.cleanup import cleanup_job_temp_files
from app.services.export.export import (
    ensure_job_exports,
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
    build_stock_aware_preview,
    build_stock_mapped_metadata,
    get_stock_field_options,
    validate_file_metadata_for_stock,
)
from app.services.storage import storage
from app.services.upload import UploadValidationError, save_upload_file

router = APIRouter(
    prefix='/jobs',
    tags=['jobs'],
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

    desktop_settings = get_desktop_settings()
    job = ProcessingJob(
        files=job_files,
        shooting_context=shooting_context,
        ai_provider=desktop_settings.selected_provider,
        effective_ai_provider=desktop_settings.effective_provider,
        effective_ai_model=desktop_settings.effective_model,
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

    if 'ai_provider' in payload.model_fields_set:
        if payload.ai_provider is None:
            job.effective_ai_provider = None
            job.effective_ai_model = None
        else:
            desktop_settings = update_desktop_settings(payload.ai_provider)
            job.effective_ai_provider = desktop_settings.effective_provider
            job.effective_ai_model = desktop_settings.effective_model

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

    effective_ai_settings = resolve_effective_ai_settings(job.ai_provider)
    job.ai_provider = effective_ai_settings.provider
    job.effective_ai_provider = effective_ai_settings.provider
    job.effective_ai_model = effective_ai_settings.model
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
    regenerate_result = await regenerate_metadata_for_file(
        job_file,
        resolved_ai_provider,
        job.job_id,
        resolved_shooting_context,
        resolved_stock_platform,
    )
    apply_generated_metadata_to_file(job_file, regenerate_result.metadata)
    job_file.status = FileStatus.COMPLETED

    regenerated_snapshot = _build_metadata_snapshot(job_file)
    regenerate_attempt = RegenerateAttempt(
        shooting_context=resolved_shooting_context,
        stock_platform=resolved_stock_platform,
        ai_provider=regenerate_result.provider,
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
async def get_job_results(
    job_id: UUID,
    stock_platform: StockPlatform | None = Query(
        default=None,
        description='Preview metadata mapped to selected stock platform',
    ),
):
    """
    Возвращает preview-результаты метаданных для задачи.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    preview_stock_platform = (
        stock_platform or job.stock_platform or StockPlatform.SHUTTERSTOCK
    )

    return ProcessingJobMetadataResults(
        job_id=job.job_id,
        status=job.status,
        results=[
            _build_metadata_result(file, preview_stock_platform)
            for file in job.files
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
        job_file.field_sources['title'] = MetadataFieldSource.EDITED
    if 'description' in payload.model_fields_set:
        job_file.description = payload.description
        job_file.field_sources['description'] = MetadataFieldSource.EDITED
    if 'keywords' in payload.model_fields_set:
        job_file.keywords = payload.keywords or []
        job_file.field_sources['keywords'] = MetadataFieldSource.EDITED
    if (
        'selected_for_export' in payload.model_fields_set
        and payload.selected_for_export is not None
    ):
        job_file.selected_for_export = bool(payload.selected_for_export)
    if 'categories' in payload.model_fields_set:
        job_file.categories = payload.categories or []
        job_file.field_sources['categories'] = MetadataFieldSource.EDITED
    if 'releases' in payload.model_fields_set:
        job_file.releases = payload.releases or []
        job_file.field_sources['releases'] = MetadataFieldSource.EDITED
    if 'category_2' in payload.model_fields_set:
        job_file.category_2 = payload.category_2
        job_file.field_sources['category_2'] = MetadataFieldSource.EDITED
    if 'license_type' in payload.model_fields_set:
        job_file.license_type = payload.license_type
        job_file.field_sources['license_type'] = MetadataFieldSource.EDITED
    if 'location_metadata' in payload.model_fields_set:
        job_file.location_metadata = payload.location_metadata
        job_file.field_sources['location_metadata'] = (
            MetadataFieldSource.EDITED
        )
    if 'editorial_date' in payload.model_fields_set:
        job_file.editorial_date = payload.editorial_date
        job_file.field_sources['editorial_date'] = MetadataFieldSource.EDITED
    if 'is_editorial' in payload.model_fields_set:
        job_file.is_editorial = bool(payload.is_editorial)
        job_file.field_sources['is_editorial'] = MetadataFieldSource.EDITED
    if 'editorial_caption' in payload.model_fields_set:
        job_file.editorial_caption = payload.editorial_caption
        job_file.field_sources['editorial_caption'] = (
            MetadataFieldSource.EDITED
        )
    if 'has_people' in payload.model_fields_set:
        job_file.has_people = payload.has_people
        job_file.field_sources['has_people'] = MetadataFieldSource.EDITED
    if 'people_count' in payload.model_fields_set:
        job_file.people_count = payload.people_count
        job_file.field_sources['people_count'] = MetadataFieldSource.EDITED
    if 'model_release_available' in payload.model_fields_set:
        job_file.model_release_available = payload.model_release_available
        job_file.field_sources['model_release_available'] = (
            MetadataFieldSource.EDITED
        )
    if 'ai_generated_content_disclosure' in payload.model_fields_set:
        job_file.ai_generated_content_disclosure = bool(
            payload.ai_generated_content_disclosure
        )
        job_file.field_sources['ai_generated_content_disclosure'] = (
            MetadataFieldSource.EDITED
        )
    if 'is_illustration' in payload.model_fields_set:
        job_file.is_illustration = payload.is_illustration
        job_file.field_sources['is_illustration'] = MetadataFieldSource.EDITED
    if 'mature_content' in payload.model_fields_set:
        job_file.mature_content = payload.mature_content
        job_file.field_sources['mature_content'] = MetadataFieldSource.EDITED
    if 'iptc_embedded_metadata' in payload.model_fields_set:
        job_file.iptc_embedded_metadata = bool(payload.iptc_embedded_metadata)
        job_file.field_sources['iptc_embedded_metadata'] = (
            MetadataFieldSource.EDITED
        )

    await storage.update_job(job)

    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK

    return _build_metadata_result(job_file, stock_platform)


# --- экспорт ---


@router.post(
    '/{job_id}/export',
    response_model=ProcessingJobExportStatus,
)
async def start_job_export(
    job_id: UUID,
    background_tasks: BackgroundTasks,
    csv: bool = Query(
        default=False,
        description='Include CSV export format',
    ),
    iptc: bool = Query(
        default=False,
        description='Include IPTC export format',
    ),
):
    """
    Запускает подготовку экспорта задачи в выбранных форматах.
    """
    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    selected_export_formats = _resolve_selected_export_formats(
        csv=csv,
        iptc=iptc,
    )

    if not selected_export_formats:
        raise HTTPException(
            status_code=400,
            detail='At least one export format must be selected',
        )

    completed_files = [
        file
        for file in job.files
        if file.status == FileStatus.COMPLETED and file.selected_for_export
    ]
    if not completed_files:
        raise HTTPException(
            status_code=400,
            detail='No selected completed files available for export',
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
    job.export_formats = selected_export_formats
    trigger_export_format = selected_export_formats[0]
    job.export_format = trigger_export_format
    job.export_error_message = None
    job.export_artifacts = []
    await storage.update_job(job)

    background_tasks.add_task(
        run_job_export,
        job.job_id,
        trigger_export_format,
    )

    return ProcessingJobExportStatus(
        job_id=job.job_id,
        export_status=job.export_status,
        export_progress=job.export_progress,
        export_format=job.export_format,
        export_error_message=job.export_error_message,
        export_artifacts=job.export_artifacts,
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
        export_artifacts=job.export_artifacts,
    )


@router.get('/{job_id}/export')
async def export_job(
    job_id: UUID,
    csv: bool = Query(
        default=False,
        description='Download CSV export artifacts',
    ),
    iptc: bool = Query(
        default=False,
        description='Download IPTC export artifacts',
    ),
):
    """
    Возвращает экспорт задачи в выбранных форматах.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    selected_export_formats = _resolve_selected_export_formats(
        csv=csv,
        iptc=iptc,
    )

    if not selected_export_formats:
        raise HTTPException(
            status_code=400,
            detail='At least one export format must be selected',
        )

    previous_export_formats = list(job.export_formats)
    job.export_formats = selected_export_formats

    try:
        export_artifacts = await run_in_threadpool(
            ensure_job_exports,
            job,
            selected_export_formats[0],
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    finally:
        job.export_formats = previous_export_formats

    filtered_artifacts = [
        artifact
        for artifact in export_artifacts
        if artifact.export_format in selected_export_formats
    ]

    if not filtered_artifacts:
        raise HTTPException(
            status_code=404,
            detail='No export artifacts found',
        )

    resolved_artifacts: list[tuple[Path, str, ExportFormat]] = []

    for artifact in filtered_artifacts:
        artifact_path = Path(artifact.path)
        if not artifact_path.is_file():
            raise HTTPException(
                status_code=404,
                detail=f'Export file not found: {artifact.filename}',
            )

        resolved_artifacts.append(
            (artifact_path, artifact.filename, artifact.export_format)
        )

    if len(resolved_artifacts) == 1:
        file_path, filename, artifact_format = resolved_artifacts[0]
        media_type = _detect_artifact_media_type(artifact_format)

        return Response(
            content=file_path.read_bytes(),
            media_type=media_type,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
            },
        )

    return _build_zip_export_response(
        job_id=job_id,
        artifacts=[
            (artifact_path, filename)
            for artifact_path, filename, _ in resolved_artifacts
        ],
    )


def _build_metadata_result(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> ProcessingJobMetadataResult:
    """
    Собирает stock-aware результат metadata для preview и PATCH-ответов.
    """
    mapped_metadata = build_stock_mapped_metadata(file, stock_platform)
    validation = validate_file_metadata_for_stock(
        file,
        stock_platform,
    )
    edited_fields = sorted(
        field_name
        for field_name, source in file.field_sources.items()
        if source == MetadataFieldSource.EDITED
    )

    return ProcessingJobMetadataResult(
        file_id=file.file_id,
        filename=file.filename,
        original_filename=file.original_filename,
        status=file.status,
        title=mapped_metadata.title,
        description=mapped_metadata.description,
        keywords=mapped_metadata.keywords,
        categories=mapped_metadata.categories,
        category_2=mapped_metadata.category_2,
        license_type=mapped_metadata.license_type,
        location_metadata=mapped_metadata.location_metadata,
        editorial_date=mapped_metadata.editorial_date,
        is_editorial=mapped_metadata.is_editorial,
        editorial_caption=mapped_metadata.editorial_caption,
        has_people=mapped_metadata.has_people,
        people_count=mapped_metadata.people_count,
        model_release_available=mapped_metadata.model_release_available,
        releases=mapped_metadata.releases,
        ai_generated_content_disclosure=(
            mapped_metadata.ai_generated_content_disclosure
        ),
        is_illustration=mapped_metadata.is_illustration,
        mature_content=mapped_metadata.mature_content,
        iptc_embedded_metadata=mapped_metadata.iptc_embedded_metadata,
        selected_for_export=file.selected_for_export,
        field_sources=file.field_sources,
        edited_fields=edited_fields,
        preview=build_stock_aware_preview(file, stock_platform),
        error_message=file.error_message,
        validation=validation,
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
        ai_generated_content_disclosure=file.ai_generated_content_disclosure,
        is_illustration=file.is_illustration,
        mature_content=file.mature_content,
        iptc_embedded_metadata=file.iptc_embedded_metadata,
    )


def _resolve_selected_export_formats(
    *,
    csv: bool,
    iptc: bool,
) -> list[ExportFormat]:
    selected: list[ExportFormat] = []

    if csv:
        selected.append(ExportFormat.CSV)

    if iptc:
        selected.append(ExportFormat.IPTC)

    return selected


def _detect_artifact_media_type(
    export_format: ExportFormat,
) -> str:
    if export_format == ExportFormat.CSV:
        return 'text/csv; charset=utf-8'

    if export_format == ExportFormat.IPTC:
        return 'image/jpeg'

    return 'application/octet-stream'


def _build_zip_export_response(
    job_id: UUID,
    artifacts: list[tuple[Path, str]],
) -> Response:
    zip_buffer = BytesIO()

    with ZipFile(zip_buffer, mode='w', compression=ZIP_DEFLATED) as zip_file:
        for file_path, arc_name in artifacts:
            zip_file.write(file_path, arcname=arc_name)

    zip_content = zip_buffer.getvalue()
    archive_name = f'{job_id}_exports.zip'

    return Response(
        content=zip_content,
        media_type='application/zip',
        headers={
            'Content-Disposition': f'attachment; filename="{archive_name}"',
        },
    )
