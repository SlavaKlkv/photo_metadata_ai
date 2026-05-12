from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.job import (
    CreateProcessingJobRequest,
    ProcessingJob,
    ProcessingJobFile,
    ProcessingJobFileStatus,
    ProcessingJobMetadataResult,
    ProcessingJobMetadataResults,
    ProcessingJobStatus,
    UpdateProcessingJobMetadataRequest,
)
from app.services.storage import storage

router = APIRouter(
    prefix='/jobs',
    tags=['jobs'],
)


@router.post('/', response_model=ProcessingJob)
def create_job(payload: CreateProcessingJobRequest):
    job = ProcessingJob(
        files=[
            ProcessingJobFile(
                # Временно до санитанизации filename=file.original_filename,
                # потом будет безопасное имя
                filename=file.original_filename,
                original_filename=file.original_filename,
            )
            for file in payload.files
        ],
    )

    return storage.create_job(job)


@router.get('/{job_id}', response_model=ProcessingJob)
def get_job(job_id: UUID):
    job = storage.get_job(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail='Job not found',
        )

    return job


@router.get('/{job_id}/status', response_model=ProcessingJobStatus)
def get_job_status(job_id: UUID):
    """
    Return current processing status for a job and its files.
    Возвращает текущий статус обработки задачи и ее файлов.
    """

    job = storage.get_job(job_id)

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
                filename=file.filename,
                original_filename=file.original_filename,
                status=file.status,
                error_message=file.error_message,
            )
            for file in job.files
        ],
    )


@router.get('/{job_id}/results', response_model=ProcessingJobMetadataResults)
def get_job_results(job_id: UUID):
    """
    Возвращает preview-результаты метаданных для задачи.
    """

    job = storage.get_job(job_id)

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


@router.patch(
    '/{job_id}/files/{file_id}/metadata',
    response_model=ProcessingJobMetadataResult,
)

def update_file_metadata(
    job_id: UUID,
    file_id: UUID,
    payload: UpdateProcessingJobMetadataRequest,
):
    """
    Обновляет редактируемые поля метаданных одного файла в задаче.
    """

    job = storage.get_job(job_id)

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

    storage.update_job(job)

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


@router.get('/', response_model=list[ProcessingJob])
def list_jobs():
    return storage.list_jobs()
