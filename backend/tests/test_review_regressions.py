from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.jobs import jobs as jobs_api
from app.core.enums import (
    AIProvider,
    FileStatus,
    JobStatus,
    MetadataFieldSource,
    StockPlatform,
)
from app.main import app
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.ai.ai_fallback import FallbackMetadataResult
from app.services.ai.ai_provider import AIMetadataResponse
from app.services.export.csv import generate_metadata_csv
from app.storage.jobs import storage


@pytest.fixture(autouse=True)
def clear_jobs_storage():
    storage._jobs.clear()
    yield
    storage._jobs.clear()


def test_review_patch_persists_edits_and_remaps_preview():
    job = _build_completed_job()
    first_file = job.files[0]

    with TestClient(app) as client:
        patch_response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/{first_file.file_id}/metadata',
            json={
                'title': 'Edited adobe ready photo title',
                'keywords': ['edited', 'stock', 'metadata'],
                'categories': ['Animals'],
                'license_type': 'standard',
                'selected_for_export': False,
            },
        )
        assert patch_response.status_code == 200
        patch_payload = patch_response.json()

        results_response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'stock_platform': 'adobe_stock'},
        )
        assert results_response.status_code == 200

    results_payload = results_response.json()
    first_result = results_payload['results'][0]

    assert patch_payload['selected_for_export'] is False
    assert first_result['title'] == 'Edited adobe ready photo title'
    assert first_result['keywords'] == ['edited', 'stock', 'metadata']
    assert first_result['selected_for_export'] is False
    assert set(first_result['edited_fields']) >= {
        'title',
        'keywords',
        'categories',
        'license_type',
    }
    assert first_result['field_sources']['title'] == 'edited'
    assert first_result['field_sources']['keywords'] == 'edited'
    assert first_result['field_sources']['categories'] == 'edited'
    assert first_result['preview']['stock_platform'] == 'adobe_stock'
    assert first_result['preview']['stock_specific']['fields']


def test_review_patch_editorial_false_clears_editorial_required_errors():
    job = _build_completed_job()
    job.stock_platform = StockPlatform.GETTY_IMAGES
    first_file = job.files[0]
    first_file.is_editorial = True
    first_file.license_type = 'editorial'
    first_file.editorial_date = None
    first_file.location_metadata = None
    first_file.editorial_caption = 'Generated editorial caption'

    with TestClient(app) as client:
        response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/{first_file.file_id}/metadata',
            json={'is_editorial': False},
        )

    assert response.status_code == 200
    payload = response.json()
    blocking_fields = {
        (error['field'], error['code'])
        for error in payload['preview']['errors']
    }
    assert payload['is_editorial'] is False
    assert payload['license_type'] == 'creative'
    assert ('editorial_date', 'required') not in blocking_fields
    assert ('location_metadata', 'required') not in blocking_fields


def test_csv_export_uses_latest_metadata_and_skips_unselected_files():
    job = _build_completed_job()
    first_file, second_file = job.files
    first_file.title = 'Edited title that should not export'
    first_file.selected_for_export = False
    second_file.title = 'Latest selected title'
    second_file.keywords = ['latest', 'selected', 'metadata']

    csv_content = generate_metadata_csv(job, StockPlatform.SHUTTERSTOCK)

    assert 'first.jpg' not in csv_content
    assert 'Edited title that should not export' not in csv_content
    assert 'second.jpg' in csv_content
    assert 'Latest selected title' in csv_content
    assert 'latest, selected, metadata' in csv_content


def test_results_endpoint_returns_paginated_stably_sorted_page():
    job = _build_completed_job(
        files=[
            _build_completed_file(
                filename='zebra.jpg',
                original_filename='zebra.jpg',
                title='Zebra title',
            ),
            _build_completed_file(
                filename='alpha.jpg',
                original_filename='alpha.jpg',
                title='Alpha title',
            ),
            _build_completed_file(
                filename='middle.jpg',
                original_filename='middle.jpg',
                title='Middle title',
            ),
        ]
    )

    with TestClient(app) as client:
        response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'page': 2, 'page_size': 1},
        )

    assert response.status_code == 200
    payload = response.json()
    assert [result['original_filename'] for result in payload['results']] == [
        'middle.jpg'
    ]
    assert payload['pagination'] == {
        'page': 2,
        'page_size': 1,
        'total_items': 3,
        'total_pages': 3,
        'has_next': True,
        'has_prev': True,
    }


def test_results_pagination_does_not_reset_selection_between_pages():
    job = _build_completed_job(
        files=[
            _build_completed_file(
                filename=f'image-{index:03}.jpg',
                original_filename=f'image-{index:03}.jpg',
                title=f'Image {index:03} title',
            )
            for index in range(1, 6)
        ]
    )
    second_file = job.files[1]

    with TestClient(app) as client:
        patch_response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/{second_file.file_id}/metadata',
            json={'selected_for_export': False},
        )
        assert patch_response.status_code == 200

        page_one_response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'page': 1, 'page_size': 2},
        )
        page_two_response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'page': 2, 'page_size': 2},
        )

    assert page_one_response.status_code == 200
    assert page_two_response.status_code == 200
    page_one_results = page_one_response.json()['results']
    page_two_results = page_two_response.json()['results']
    assert page_one_results[1]['original_filename'] == 'image-002.jpg'
    assert page_one_results[1]['selected_for_export'] is False
    assert all(result['selected_for_export'] for result in page_two_results)


def test_results_pagination_handles_large_jobs_with_page_slice():
    job = _build_completed_job(
        files=[
            _build_completed_file(
                filename=f'image-{index:03}.jpg',
                original_filename=f'image-{index:03}.jpg',
                title=f'Image {index:03} title',
            )
            for index in range(1, 306)
        ]
    )

    with TestClient(app) as client:
        response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'page': 7, 'page_size': 50},
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload['results']) == 5
    assert payload['results'][0]['original_filename'] == 'image-301.jpg'
    assert payload['pagination'] == {
        'page': 7,
        'page_size': 50,
        'total_items': 305,
        'total_pages': 7,
        'has_next': False,
        'has_prev': True,
    }


def test_bulk_selection_updates_all_pages_and_export_uses_full_selection():
    job = _build_completed_job(
        files=[
            _build_completed_file(
                filename=f'image-{index:03}.jpg',
                original_filename=f'image-{index:03}.jpg',
                title=f'Image {index:03} title',
            )
            for index in range(1, 6)
        ]
    )
    job.files[0].selected_for_export = False

    with TestClient(app) as client:
        select_all_response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/selection',
            json={'selected_for_export': True},
        )
        page_three_response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'page': 3, 'page_size': 2},
        )

    csv_content = generate_metadata_csv(job, StockPlatform.SHUTTERSTOCK)

    assert select_all_response.status_code == 200
    assert select_all_response.json()['updated_count'] == 5
    assert page_three_response.status_code == 200
    page_three_result = page_three_response.json()['results'][0]
    assert page_three_result['selected_for_export'] is True
    assert csv_content.count('.jpg') == 5


def test_regenerate_returns_not_found_for_missing_job_or_file():
    job = _build_completed_job()

    with TestClient(app) as client:
        missing_job_response = client.post(
            f'/api/v1/jobs/{uuid4()}/files/{job.files[0].file_id}/regenerate'
        )
        missing_file_response = client.post(
            f'/api/v1/jobs/{job.job_id}/files/{uuid4()}/regenerate'
        )

    assert missing_job_response.status_code == 404
    assert missing_file_response.status_code == 404


def test_regenerate_rejects_processing_job_and_non_completed_file():
    processing_job = _build_completed_job(status=JobStatus.PROCESSING)
    queued_job = _build_completed_job()
    queued_job.files[0].status = FileStatus.QUEUED

    with TestClient(app) as client:
        processing_response = client.post(
            (
                f'/api/v1/jobs/{processing_job.job_id}/files/'
                f'{processing_job.files[0].file_id}/regenerate'
            )
        )
        queued_file_response = client.post(
            (
                f'/api/v1/jobs/{queued_job.job_id}/files/'
                f'{queued_job.files[0].file_id}/regenerate'
            )
        )

    assert processing_response.status_code == 409
    assert queued_file_response.status_code == 400


def test_regenerate_saves_attempt_history_and_keeps_other_files_unchanged(
    monkeypatch,
):
    job = _build_completed_job()
    first_file, second_file = job.files
    first_file.title = 'Edited title before regenerate'
    second_original_title = second_file.title

    async def fake_regenerate_metadata_for_file(*args, **kwargs):
        return FallbackMetadataResult(
            metadata=AIMetadataResponse(
                title='Regenerated title',
                description='Regenerated description',
                keywords=['regenerated', 'metadata'],
                categories=['Nature'],
            ),
            provider=AIProvider.GEMINI,
            model='gemini-test-model',
        )

    monkeypatch.setattr(
        jobs_api,
        'regenerate_metadata_for_file',
        fake_regenerate_metadata_for_file,
    )

    with TestClient(app) as client:
        response = client.post(
            (
                f'/api/v1/jobs/{job.job_id}/files/'
                f'{first_file.file_id}/regenerate'
            ),
            json={'ai_provider': 'ollama'},
        )
        job_response = client.get(f'/api/v1/jobs/{job.job_id}')

    assert response.status_code == 200
    payload = response.json()
    assert payload['previous_metadata']['title'] == (
        'Edited title before regenerate'
    )
    assert payload['metadata']['title'].startswith('Regenerated title')
    assert len(payload['metadata']['title'].split()) >= 5

    stored_first_file = job_response.json()['files'][0]
    stored_second_file = job_response.json()['files'][1]
    assert stored_first_file['regenerate_attempts']
    assert stored_first_file['regenerate_attempts'][0]['ai_provider'] == (
        'gemini'
    )
    assert (
        stored_first_file['regenerate_attempts'][0]['previous_metadata'][
            'title'
        ]
        == 'Edited title before regenerate'
    )
    assert stored_second_file['title'] == second_original_title


def _build_completed_job(
    *,
    status: JobStatus = JobStatus.COMPLETED,
    files: list[ProcessingJobFile] | None = None,
) -> ProcessingJob:
    job = ProcessingJob(
        status=status,
        ai_provider=AIProvider.MOCK,
        stock_platform=StockPlatform.SHUTTERSTOCK,
        files=files
        or [
            _build_completed_file(
                filename='first.jpg',
                original_filename='first.jpg',
                title='Generated first stock photo title',
            ),
            _build_completed_file(
                filename='second.jpg',
                original_filename='second.jpg',
                title='Generated second stock photo title',
            ),
        ],
    )
    storage._jobs[job.job_id] = job
    return job


def _build_completed_file(
    *,
    filename: str,
    original_filename: str,
    title: str,
) -> ProcessingJobFile:
    return ProcessingJobFile(
        filename=filename,
        original_filename=original_filename,
        status=FileStatus.COMPLETED,
        title=title,
        description='Generated stock metadata description',
        keywords=['stock', 'photo', 'metadata', 'review', 'export'],
        categories=['Nature'],
        license_type='commercial',
        location_metadata='Unknown location',
        has_people=False,
        people_count=0,
        model_release_available=False,
        field_sources={
            'title': MetadataFieldSource.GENERATED,
            'description': MetadataFieldSource.GENERATED,
            'keywords': MetadataFieldSource.GENERATED,
            'categories': MetadataFieldSource.GENERATED,
            'license_type': MetadataFieldSource.GENERATED,
        },
    )
