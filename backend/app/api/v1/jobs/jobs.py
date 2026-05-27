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

from app.core.enums import ExportFormat, ExportStatus, JobStatus
from app.schemas.job import (
    FileStatus,
    ProcessingJob,
    ProcessingJobExportStatus,
    ProcessingJobFile,
    ProcessingJobFileStatus,
    ProcessingJobMetadataResult,
    ProcessingJobMetadataResults,
    ProcessingJobStatus,
    UpdateProcessingJobMetadataRequest,
    UpdateProcessingJobSettingsRequest,
)
from app.services.export.export import (
    generate_job_export,
    load_stored_job_export,
    run_job_export,
)
from app.services.processing import (
    cancel_job_processing,
    process_job,
    retry_failed_files,
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

    return await storage.update_job(job)


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

    return ProcessingJobMetadataResults(
        job_id=job.job_id,
        status=job.status,
        results=[
            # Ответ results сформирован как строки таблицы для фронтенда.
            ProcessingJobMetadataResult(
                file_id=file.file_id,
                filename=file.filename,
                original_filename=file.original_filename,
                status=file.status,
                title=file.title,
                description=file.description,
                keywords=file.keywords,
                error_message=file.error_message,
            )
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

    job_file = next(
        (file for file in job.files if file.file_id == file_id),
        None,
    )

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

    await storage.update_job(job)

    return ProcessingJobMetadataResult(
        file_id=job_file.file_id,
        filename=job_file.filename,
        original_filename=job_file.original_filename,
        status=job_file.status,
        title=job_file.title,
        description=job_file.description,
        keywords=job_file.keywords,
        error_message=job_file.error_message,
    )


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
