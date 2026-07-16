import pytest

from app.core.runtime import (
    ensure_runtime_directories,
    get_runtime_directories,
    reset_runtime_directories_cache,
    resolve_path_in_base,
)


def test_resolve_path_in_base_returns_resolved_child(tmp_path):
    result = resolve_path_in_base(tmp_path, 'child', 'file.txt')

    assert result == (tmp_path / 'child' / 'file.txt').resolve()


def test_resolve_path_in_base_allows_base_itself(tmp_path):
    assert resolve_path_in_base(tmp_path) == tmp_path.resolve()


def test_resolve_path_in_base_rejects_parent_traversal(tmp_path):
    with pytest.raises(ValueError):
        resolve_path_in_base(tmp_path, '..', 'evil.txt')


def test_resolve_path_in_base_rejects_nested_traversal(tmp_path):
    with pytest.raises(ValueError):
        resolve_path_in_base(tmp_path, 'child/../../evil.txt')


def test_resolve_path_in_base_rejects_absolute_path_outside(tmp_path):
    outside = tmp_path.parent / 'outside.txt'

    with pytest.raises(ValueError):
        resolve_path_in_base(tmp_path, outside)


def test_runtime_directories_structure_is_consistent():
    directories = get_runtime_directories()

    assert directories.jobs_dir == directories.workspace_dir / 'jobs'
    assert directories.uploads_dir == directories.jobs_dir / 'uploads'
    assert directories.job_storage_db_path == (
        directories.jobs_dir / 'job_storage.sqlite'
    )
    assert directories.temp_dir == directories.workspace_dir / 'temp'
    assert directories.temp_preview_dir == directories.temp_dir / 'previews'
    assert directories.temp_export_dir == directories.temp_dir / 'exports'
    assert directories.temp_zip_dir == directories.temp_dir / 'zips'
    assert directories.temp_resized_dir == directories.temp_dir / 'resized'


def test_ensure_runtime_directories_creates_all_directories():
    directories = ensure_runtime_directories()

    for path in (
        directories.workspace_dir,
        directories.jobs_dir,
        directories.uploads_dir,
        directories.results_dir,
        directories.temp_dir,
        directories.temp_preview_dir,
        directories.temp_export_dir,
        directories.temp_zip_dir,
        directories.temp_resized_dir,
    ):
        assert path.is_dir()


def test_get_runtime_directories_is_cached_until_reset():
    first = get_runtime_directories()

    assert get_runtime_directories() is first

    reset_runtime_directories_cache()

    second = get_runtime_directories()

    assert second is not first
    assert second == first
