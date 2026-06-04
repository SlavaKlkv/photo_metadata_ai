from uuid import UUID

from fastapi import (
    APIRouter,
    HTTPException,
)
from starlette.concurrency import run_in_threadpool

from app.core.enums import StockPlatform
from app.schemas.job import (
    CreateProcessingJobRequest,
    EmbeddedMetadataResult,
    ProcessingJob,
    ProcessingJobFile,
)
from app.services.desktop.app_settings import get_desktop_settings
from app.services.metadata.metadata_embedding import embed_metadata_into_jpg
from app.services.metadata.stock_metadata import build_stock_iptc_payload
from app.storage.jobs import storage

router = APIRouter(
    prefix='/internal',
    tags=['internal'],
)


@router.post('/', response_model=ProcessingJob)
async def create_job(payload: CreateProcessingJobRequest):
    """
    Создает новую задачу обработки файлов.
    """
    desktop_settings = get_desktop_settings()
    job = ProcessingJob(
        files=[
            ProcessingJobFile(
                filename=file.original_filename,
                original_filename=file.original_filename,
            )
            for file in payload.files
        ],
        shooting_context=payload.shooting_context,
        ai_provider=desktop_settings.selected_provider,
        effective_ai_provider=desktop_settings.effective_provider,
        effective_ai_model=desktop_settings.effective_model,
    )

    return await storage.create_job(job)


@router.post(
    '/{job_id}/files/{file_id}/embed-metadata',
    response_model=EmbeddedMetadataResult,
)
async def embed_file_metadata(
    job_id: UUID,
    file_id: UUID,
):
    """
    Записывает текущие метаданные файла в IPTC-поля JPG.
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

    stock_platform = job.stock_platform or StockPlatform.SHUTTERSTOCK
    iptc_payload = build_stock_iptc_payload(job_file, stock_platform)

    await run_in_threadpool(
        embed_metadata_into_jpg,
        job_file,
        iptc_payload,
    )
    job_file.iptc_embedded_metadata = True
    await storage.update_job(job)

    return EmbeddedMetadataResult(
        file_id=job_file.file_id,
        filename=job_file.filename,
        original_filename=job_file.original_filename,
        iptc_embedded_metadata=job_file.iptc_embedded_metadata,
    )


@router.get('/', response_model=list[ProcessingJob])
async def list_jobs():
    """
    Возвращает список всех задач обработки.
    """
    return await storage.list_jobs()
