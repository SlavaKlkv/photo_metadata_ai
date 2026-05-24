from uuid import UUID

from fastapi import (
    APIRouter,
    HTTPException,
)
from starlette.concurrency import run_in_threadpool

from app.schemas.job import (
    CleanupJobResult,
    CreateProcessingJobRequest,
    EmbeddedMetadataResult,
    ProcessingJob,
    ProcessingJobFile,
)
from app.services.cleanup import cleanup_job_temp_files
from app.services.metadata_embedding import embed_metadata_into_jpg
from app.services.storage import storage

router = APIRouter(
    prefix='/internal',
    tags=['internal'],
)


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
