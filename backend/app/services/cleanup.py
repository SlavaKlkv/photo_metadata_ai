import shutil
from pathlib import Path

from app.core.constants import JOB_TEMP_DIRS, UPLOAD_DIR
from app.schemas.job import ProcessingJob


def cleanup_job_temp_files(job: ProcessingJob) -> tuple[int, int]:
    """
    Удаляет временные файлы, связанные с конкретной задачей обработки.
    """

    deleted_files = _cleanup_uploaded_files(job)
    temp_files, temp_directories = _cleanup_job_temp_directories(job)

    return deleted_files + temp_files, temp_directories


def _cleanup_uploaded_files(job: ProcessingJob) -> int:
    """
    Удаляет исходные загруженные файлы задачи из директории uploads.
    """

    deleted_files = 0

    for file in job.files:
        file_path = UPLOAD_DIR / Path(file.filename).name

        if not file_path.is_file():
            continue

        file_path.unlink()
        deleted_files += 1

    return deleted_files


def _cleanup_job_temp_directories(job: ProcessingJob) -> tuple[int, int]:
    """
    Удаляет временные директории задачи для preview, exports, ZIP и resized.
    """

    deleted_files = 0
    deleted_directories = 0

    for temp_dir in JOB_TEMP_DIRS:
        job_temp_dir = temp_dir / str(job.job_id)

        if not job_temp_dir.exists():
            continue

        deleted_files += _count_files(job_temp_dir)
        shutil.rmtree(job_temp_dir)
        deleted_directories += 1

    return deleted_files, deleted_directories


def _count_files(directory: Path) -> int:
    """
    Считает количество файлов внутри директории перед удалением.
    """

    return sum(1 for path in directory.rglob('*') if path.is_file())
