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
    monkeypatch.setattr(settings, 'DESKTOP_RESULTS_DIR', tmp_path / 'results')
    reset_runtime_directories_cache()
    _reset_job_storage()

    ensure_runtime_directories()

    yield

    _reset_job_storage()
    reset_runtime_directories_cache()


def _reset_job_storage() -> None:
    storage.reset_for_tests()
