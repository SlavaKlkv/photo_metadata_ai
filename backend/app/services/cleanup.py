import shutil
from pathlib import Path

import structlog

from app.core.runtime import get_runtime_directories, resolve_path_in_base
from app.schemas.job import ProcessingJob

logger = structlog.get_logger(__name__)


def cleanup_job_temp_files(job: ProcessingJob) -> tuple[int, int]:
    """
    Удаляет временные файлы, связанные с конкретной задачей обработки.
    """

    logger.info(
        'cleanup_job_started',
        job_id=str(job.job_id),
    )

    deleted_files = _cleanup_uploaded_files(job)
    temp_files, temp_directories = _cleanup_job_temp_directories(job)

    total_deleted_files = deleted_files + temp_files

    logger.info(
        'cleanup_job_completed',
        job_id=str(job.job_id),
        deleted_files=total_deleted_files,
        deleted_directories=temp_directories,
    )

    return total_deleted_files, temp_directories


def _cleanup_uploaded_files(job: ProcessingJob) -> int:
    """
    Удаляет исходные загруженные файлы задачи из директории uploads.
    """

    deleted_files = 0
    upload_dir = get_runtime_directories().uploads_dir

    for file in job.files:
        try:
            file_path = resolve_path_in_base(
                upload_dir,
                Path(file.filename).name,
            )
        except ValueError as error:
            logger.warning(
                'cleanup_skipped_unsafe_upload_path',
                job_id=str(job.job_id),
                filename=file.filename,
                error=str(error),
            )
            continue

        if not file_path.is_file():
            continue

        file_path.unlink()
        deleted_files += 1

        logger.debug(
            'uploaded_file_deleted',
            job_id=str(job.job_id),
            file_path=str(file_path),
        )

    return deleted_files


def _cleanup_job_temp_directories(job: ProcessingJob) -> tuple[int, int]:
    """
    Удаляет временные директории задачи для preview, exports, ZIP и resized.
    """

    deleted_files = 0
    deleted_directories = 0
    runtime_directories = get_runtime_directories()
    job_temp_dirs = [
        runtime_directories.temp_preview_dir,
        runtime_directories.temp_export_dir,
        runtime_directories.temp_zip_dir,
        runtime_directories.temp_resized_dir,
    ]

    for temp_dir in job_temp_dirs:
        try:
            job_temp_dir = resolve_path_in_base(temp_dir, str(job.job_id))
        except ValueError as error:
            logger.warning(
                'cleanup_skipped_unsafe_temp_path',
                job_id=str(job.job_id),
                temp_dir=str(temp_dir),
                error=str(error),
            )
            continue

        if not job_temp_dir.exists():
            continue

        deleted_files += _count_files(job_temp_dir)
        shutil.rmtree(job_temp_dir)
        deleted_directories += 1

        logger.debug(
            'job_temp_directory_deleted',
            job_id=str(job.job_id),
            directory_path=str(job_temp_dir),
        )

    return deleted_files, deleted_directories


def _count_files(directory: Path) -> int:
    """
    Считает количество файлов внутри директории перед удалением.
    """

    return sum(1 for path in directory.rglob('*') if path.is_file())
