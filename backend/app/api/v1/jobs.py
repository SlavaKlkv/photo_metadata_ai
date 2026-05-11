from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.job import (
    CreateProcessingJobRequest,
    ProcessingJob,
    ProcessingJobFile,
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


@router.get('/', response_model=list[ProcessingJob])
def list_jobs():
    return storage.list_jobs()
