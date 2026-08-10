from app.core.runtime import ensure_runtime_directories
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.cleanup import cleanup_job_temp_files


def _make_job_with_files(filenames: list[str]) -> ProcessingJob:
    return ProcessingJob(
        files=[
            ProcessingJobFile(filename=name, original_filename=name)
            for name in filenames
        ]
    )


def test_cleanup_removes_uploaded_files_and_temp_directories():
    directories = ensure_runtime_directories()
    job = _make_job_with_files(['a.jpg', 'b.jpg'])

    for file in job.files:
        (directories.uploads_dir / file.filename).write_bytes(b'x')

    preview_dir = directories.temp_preview_dir / str(job.job_id)
    preview_dir.mkdir(parents=True)
    (preview_dir / 'p1.jpg').write_bytes(b'x')
    (preview_dir / 'p2.jpg').write_bytes(b'x')

    export_dir = directories.temp_export_dir / str(job.job_id)
    export_dir.mkdir(parents=True)
    (export_dir / 'meta.csv').write_bytes(b'x')

    deleted_files, deleted_directories = cleanup_job_temp_files(job)

    assert deleted_files == 5
    assert deleted_directories == 2
    assert not (directories.uploads_dir / 'a.jpg').exists()
    assert not (directories.uploads_dir / 'b.jpg').exists()
    assert not preview_dir.exists()
    assert not export_dir.exists()


def test_cleanup_counts_nested_temp_files():
    directories = ensure_runtime_directories()
    job = _make_job_with_files([])

    zip_dir = directories.temp_zip_dir / str(job.job_id)
    nested_dir = zip_dir / 'nested'
    nested_dir.mkdir(parents=True)
    (zip_dir / 'top.zip').write_bytes(b'x')
    (nested_dir / 'inner.csv').write_bytes(b'x')

    deleted_files, deleted_directories = cleanup_job_temp_files(job)

    assert deleted_files == 2
    assert deleted_directories == 1


def test_cleanup_ignores_missing_files_and_directories():
    job = _make_job_with_files(['ghost.jpg'])

    deleted_files, deleted_directories = cleanup_job_temp_files(job)

    assert (deleted_files, deleted_directories) == (0, 0)


def test_cleanup_does_not_touch_other_jobs_files():
    directories = ensure_runtime_directories()
    job = _make_job_with_files(['mine.jpg'])

    (directories.uploads_dir / 'mine.jpg').write_bytes(b'x')
    (directories.uploads_dir / 'other.jpg').write_bytes(b'x')

    other_dir = directories.temp_preview_dir / 'other-job'
    other_dir.mkdir(parents=True)
    (other_dir / 'keep.jpg').write_bytes(b'x')

    deleted_files, deleted_directories = cleanup_job_temp_files(job)

    assert deleted_files == 1
    assert deleted_directories == 0
    assert (directories.uploads_dir / 'other.jpg').exists()
    assert (other_dir / 'keep.jpg').exists()
