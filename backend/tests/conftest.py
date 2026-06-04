import sys
from pathlib import Path

import pytest

from app.core.config import settings
from app.core.runtime import (
    ensure_runtime_directories,
    reset_runtime_directories_cache,
)
from app.storage.jobs import storage


@pytest.fixture(autouse=True)
def isolate_runtime_workspace(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(settings, 'WORKSPACE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'DESKTOP_WORKSPACE_DIR', None)
    reset_runtime_directories_cache()
    _reset_job_storage()

    runtime_directories = ensure_runtime_directories()
    _patch_runtime_paths(monkeypatch, runtime_directories)

    yield

    _reset_job_storage()
    reset_runtime_directories_cache()


def _reset_job_storage() -> None:
    storage.reset_for_tests()


def _patch_runtime_paths(monkeypatch, runtime_directories) -> None:

    # Импортируем после подмены WORKSPACE_DIR:
    # эти модули кэшируют runtime-пути при импорте.

    import app.services.image_preprocessing as image_preprocessing
    from app.core import constants
    from app.services import cleanup, upload
    from app.services.desktop import desktop_open
    from app.services.export import export
    from app.services.metadata import metadata_embedding

    job_temp_dirs = [
        runtime_directories.temp_preview_dir,
        runtime_directories.temp_export_dir,
        runtime_directories.temp_zip_dir,
        runtime_directories.temp_resized_dir,
    ]

    monkeypatch.setattr(constants, 'JOBS_DIR', runtime_directories.jobs_dir)
    monkeypatch.setattr(
        constants,
        'RESULTS_DIR',
        runtime_directories.results_dir,
    )
    monkeypatch.setattr(
        constants,
        'UPLOAD_DIR',
        runtime_directories.uploads_dir,
    )
    monkeypatch.setattr(constants, 'TEMP_DIR', runtime_directories.temp_dir)
    monkeypatch.setattr(
        constants,
        'TEMP_PREVIEW_DIR',
        runtime_directories.temp_preview_dir,
    )
    monkeypatch.setattr(
        constants,
        'TEMP_EXPORT_DIR',
        runtime_directories.temp_export_dir,
    )
    monkeypatch.setattr(
        constants,
        'TEMP_ZIP_DIR',
        runtime_directories.temp_zip_dir,
    )
    monkeypatch.setattr(
        constants,
        'TEMP_RESIZED_DIR',
        runtime_directories.temp_resized_dir,
    )
    monkeypatch.setattr(constants, 'JOB_TEMP_DIRS', job_temp_dirs)

    monkeypatch.setattr(upload, 'UPLOAD_DIR', runtime_directories.uploads_dir)
    monkeypatch.setattr(
        metadata_embedding,
        'UPLOAD_DIR',
        runtime_directories.uploads_dir,
    )
    monkeypatch.setattr(cleanup, 'UPLOAD_DIR', runtime_directories.uploads_dir)
    monkeypatch.setattr(cleanup, 'JOB_TEMP_DIRS', job_temp_dirs)
    monkeypatch.setattr(
        export,
        'RESULTS_DIR',
        runtime_directories.results_dir,
    )
    monkeypatch.setattr(
        desktop_open,
        'RESULTS_DIR',
        runtime_directories.results_dir,
    )
    monkeypatch.setattr(
        image_preprocessing,
        'TEMP_RESIZED_DIR',
        runtime_directories.temp_resized_dir,
    )

    for module_name in ('test_desktop_runtime', 'tests.test_desktop_runtime'):
        test_module = sys.modules.get(module_name)
        if test_module is not None:
            monkeypatch.setattr(
                test_module,
                'RESULTS_DIR',
                runtime_directories.results_dir,
                raising=False,
            )
