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

from app.core.enums import StockPlatform
from app.schemas.job import (
    CleanupJobResult,
    CreateProcessingJobRequest,
    EmbeddedMetadataResult,
    FileStatus,
    ProcessingJob,
    ProcessingJobFile,
    ProcessingJobFileStatus,
    ProcessingJobMetadataResult,
    ProcessingJobMetadataResults,
    ProcessingJobStatus,
    UpdateProcessingJobMetadataRequest,
    UpdateProcessingJobSettingsRequest,
)
from app.services.cleanup import cleanup_job_temp_files
from app.services.csv_export import (
    generate_metadata_csv,
    get_csv_filename,
)
from app.services.metadata_embedding import embed_metadata_into_jpg
from app.services.processing import (
    cancel_job_processing,
    process_job,
    retry_failed_files,
)
from app.services.storage import storage
from app.services.upload import save_upload_file

router = APIRouter(
    prefix='/jobs',
    tags=['jobs'],
)


@router.post('/upload', response_model=ProcessingJob)
async def upload_photos(
    files: list[UploadFile] = File(...),
    shooting_context: str | None = Form(None),
):
    """
    Загружает несколько JPG/PNG файлов и создает задачу обработки.
    """
    job_files = []

    for file in files:
        saved_filename = await save_upload_file(file)
        original_filename = file.filename or saved_filename

        job_files.append(
            ProcessingJobFile(
                filename=saved_filename,
                original_filename=original_filename,
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

    background_tasks.add_task(process_job, job.job_id)

    return job


@router.post('/', response_model=ProcessingJob)
async def create_job(payload: CreateProcessingJobRequest):
    """
    Создает новую задачу обработки файлов.
    """
    job = ProcessingJob(
        files=[
            ProcessingJobFile(
                filename=file.original_filename,
                original_filename=file.original_filename,
            )
            for file in payload.files
        ],
        shooting_context=payload.shooting_context,
    )

    return await storage.create_job(job)


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


@router.get('/{job_id}/export/csv')
async def export_job_csv(
    job_id: UUID,
    format: StockPlatform,
):
    """
    Возвращает CSV с метаданными задачи для выбранной стоковой платформы.
    """

    job = await storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    csv_content = generate_metadata_csv(job, format)
    filename = get_csv_filename(job, format)

    return Response(
        content=csv_content,
        media_type='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
        },
    )


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


@router.post(
    '/{job_id}/files/{file_id}/embed-metadata',
    response_model=EmbeddedMetadataResult,
)
async def embed_file_metadata(
    job_id: UUID,
    file_id: UUID,
):
    """
    Записывает текущие метаданные файла в EXIF-поля JPG.
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

    await run_in_threadpool(embed_metadata_into_jpg, job_file)

    return EmbeddedMetadataResult(
        file_id=job_file.file_id,
        filename=job_file.filename,
        original_filename=job_file.original_filename,
    )


@router.get('/', response_model=list[ProcessingJob])
async def list_jobs():
    """
    Возвращает список всех задач обработки.
    """
    return await storage.list_jobs()
