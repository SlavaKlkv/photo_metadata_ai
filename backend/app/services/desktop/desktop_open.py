import os
import platform
import subprocess
from pathlib import Path
from uuid import UUID

import structlog

from app.core.runtime import get_runtime_directories, resolve_path_in_base
from app.services.desktop.constants import ALLOWED_DESKTOP_OPEN_FILE_SUFFIXES

logger = structlog.get_logger(__name__)


def get_job_results_dir(job_id: UUID) -> Path:
    """
    Возвращает путь к директории результатов задачи.
    """
    results_dir = get_runtime_directories().results_dir
    return resolve_path_in_base(results_dir, str(job_id))


def get_job_result_file_path(job_id: UUID, filename: str) -> Path:
    """
    Возвращает безопасный путь к файлу результата внутри директории задачи.
    """
    job_results_dir = get_job_results_dir(job_id)
    safe_filename = Path(filename).name

    if safe_filename != filename:
        raise ValueError('unsafe_file_name')

    file_path = resolve_path_in_base(job_results_dir, safe_filename)

    if file_path.suffix.lower() not in ALLOWED_DESKTOP_OPEN_FILE_SUFFIXES:
        raise ValueError('unsupported_file_type')

    return file_path


def open_path_in_default_app(path: Path) -> None:
    """
    Открывает файл или директорию в системном приложении по умолчанию.
    """
    current_os = platform.system()

    if current_os == 'Darwin':
        subprocess.Popen(
            ['open', str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    if current_os == 'Windows':
        os.startfile(str(path))  # type: ignore[attr-defined]
        return

    subprocess.Popen(
        ['xdg-open', str(path)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
