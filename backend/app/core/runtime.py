from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class RuntimeDirectories:
    profile: str
    workspace_dir: Path
    desktop_storage_dir: Path
    jobs_dir: Path
    job_storage_db_path: Path
    results_dir: Path
    temp_dir: Path
    uploads_dir: Path
    temp_preview_dir: Path
    temp_export_dir: Path
    temp_zip_dir: Path
    temp_resized_dir: Path


def build_runtime_directories() -> RuntimeDirectories:
    """
    Строит структуру runtime-директорий на основе текущих settings.
    """
    workspace_dir = settings.workspace_root
    desktop_storage_dir = settings.desktop_storage_root
    jobs_dir = workspace_dir / 'jobs'
    results_dir = settings.results_root
    temp_dir = workspace_dir / 'temp'

    return RuntimeDirectories(
        profile=settings.runtime_profile,
        workspace_dir=workspace_dir,
        desktop_storage_dir=desktop_storage_dir,
        jobs_dir=jobs_dir,
        job_storage_db_path=jobs_dir / 'job_storage.sqlite',
        results_dir=results_dir,
        temp_dir=temp_dir,
        uploads_dir=jobs_dir / 'uploads',
        temp_preview_dir=temp_dir / 'previews',
        temp_export_dir=temp_dir / 'exports',
        temp_zip_dir=temp_dir / 'zips',
        temp_resized_dir=temp_dir / 'resized',
    )


@lru_cache(maxsize=1)
def get_runtime_directories() -> RuntimeDirectories:
    """
    Возвращает кэшированный runtime-снимок директорий.
    """
    return build_runtime_directories()


def reset_runtime_directories_cache() -> None:
    """
    Сбрасывает кэш runtime-директорий.
    """
    get_runtime_directories.cache_clear()


def ensure_runtime_directories() -> RuntimeDirectories:
    runtime_directories = get_runtime_directories()

    for directory in [
        runtime_directories.workspace_dir,
        runtime_directories.desktop_storage_dir,
        runtime_directories.jobs_dir,
        runtime_directories.results_dir,
        runtime_directories.temp_dir,
        runtime_directories.uploads_dir,
        runtime_directories.temp_preview_dir,
        runtime_directories.temp_export_dir,
        runtime_directories.temp_zip_dir,
        runtime_directories.temp_resized_dir,
    ]:
        directory.mkdir(parents=True, exist_ok=True)

    logger.info(
        'runtime_directories_initialized',
        profile=runtime_directories.profile,
        workspace_dir=str(runtime_directories.workspace_dir),
        desktop_storage_dir=str(runtime_directories.desktop_storage_dir),
        jobs_dir=str(runtime_directories.jobs_dir),
        results_dir=str(runtime_directories.results_dir),
        temp_dir=str(runtime_directories.temp_dir),
    )
    return runtime_directories


def resolve_path_in_base(
    base_dir: Path,
    *parts: str | Path,
) -> Path:
    candidate = base_dir

    for part in parts:
        candidate = candidate / Path(part)

    resolved_base_dir = base_dir.resolve(strict=False)
    resolved_candidate = candidate.resolve(strict=False)

    if not resolved_candidate.is_relative_to(resolved_base_dir):
        raise ValueError(
            f'Path {resolved_candidate} is outside of allowed '
            f'directory {resolved_base_dir}'
        )

    return resolved_candidate
