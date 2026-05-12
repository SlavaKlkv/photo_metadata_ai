from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.job import (
    CreateProcessingJobRequest,
    ProcessingJob,
    ProcessingJobFile,
    ProcessingJobFileStatus,
    ProcessingJobStatus,
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
            # Polling response should include only fields needed to update UI
            # progress and show file-level errors.
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


@router.get('/', response_model=list[ProcessingJob])
def list_jobs():
    return storage.list_jobs()
