import csv
from io import BytesIO, StringIO
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from iptcinfo3 import IPTCInfo
from PIL import Image

from app.api.v1.jobs import jobs as jobs_api
from app.core.enums import (
    AIProvider,
    FileStatus,
    JobStatus,
    MetadataFieldSource,
    StockPlatform,
)
from app.core.runtime import get_runtime_directories
from app.main import app
from app.schemas.job import ProcessingJob, ProcessingJobFile
from app.services.ai.ai_fallback import FallbackMetadataResult
from app.services.ai.ai_provider import AIMetadataResponse
from app.services.export.csv import generate_metadata_csv
from app.services.metadata.metadata_embedding import embed_metadata_into_jpg
from app.services.metadata.stock_mapping import build_stock_iptc_payload
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
    stock_fields = {
        field['label']: field
        for field in first_result['preview']['stock_specific']['fields']
    }
    assert stock_fields['Category']['key'] == 'categories'
    assert stock_fields['Category']['value'] == 'Animals'


def test_results_endpoint_uses_requested_stock_platform_over_job_default():
    job = _build_completed_job()
    job.stock_platform = StockPlatform.SHUTTERSTOCK

    with TestClient(app) as client:
        response = client.get(
            f'/api/v1/jobs/{job.job_id}/results',
            params={'stock_platform': 'getty_images'},
        )

    assert response.status_code == 200
    result = response.json()['results'][0]
    assert result['preview']['stock_platform'] == 'getty_images'
    assert result['license_type'] == 'creative'


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


def test_shutterstock_csv_formats_categories_with_comma_separator():
    job = _build_completed_job()
    file = job.files[0]
    file.categories = ['Transportation', 'Animals/Wildlife']

    rows = list(
        csv.DictReader(
            StringIO(generate_metadata_csv(job, StockPlatform.SHUTTERSTOCK))
        )
    )

    assert rows[0]['Categories'] == 'Transportation, Animals/Wildlife'


def test_iptc_export_writes_readable_stock_mapped_metadata():
    job = _build_completed_job()
    file = job.files[0]
    file.filename = 'iptc-readback.jpg'
    file.title = 'Readable IPTC title'
    file.description = 'Readable IPTC description'
    file.keywords = ['travel', 'cityscape', 'london']
    file.categories = ['Travel', 'Nature']
    file.category_2 = 'Nature'
    file.license_type = 'editorial'
    file.is_editorial = True
    file.editorial_caption = 'London, England - Editorial caption'
    file.editorial_date = '2026-07-13'
    file.location_metadata = 'London, England, United Kingdom'
    file.model_release_available = False
    file.releases = ['model-release.pdf']

    image_path = get_runtime_directories().uploads_dir / file.filename
    image_path.write_bytes(_build_tiny_jpeg_bytes())
    payload = build_stock_iptc_payload(file, StockPlatform.GETTY_IMAGES)

    embed_metadata_into_jpg(file, payload=payload, file_path=image_path)

    iptc_info = IPTCInfo(
        str(image_path),
        force=True,
        inp_charset='utf_8',
    )

    assert _iptc_text(iptc_info['object name']) == 'Readable IPTC title'
    assert _iptc_text(iptc_info['caption/abstract']) == (
        'London, England - Editorial caption'
    )
    keywords = _iptc_list(iptc_info['keywords'])
    assert keywords[:3] == ['travel', 'cityscape', 'london']
    assert _iptc_list(iptc_info['supplemental category']) == [
        'Travel',
        'Nature',
    ]
    assert _iptc_text(iptc_info['city']) == 'London'
    assert _iptc_text(iptc_info['province/state']) == 'England'
    assert _iptc_text(iptc_info['country/primary location name']) == (
        'United Kingdom'
    )
    assert _iptc_text(iptc_info['date created']) == '20260713'
    assert _iptc_text(iptc_info['special instructions']) == (
        'license=editorial; releases=model-release.pdf; editorial=yes; '
        'editorial_date=2026-07-13; '
        'location=London, England, United Kingdom'
    )


def test_iptc_payload_uses_structured_location_over_string_order():
    job = _build_completed_job()
    file = job.files[0]
    # Строка намеренно в "неудобном" порядке: без структуры позиционный
    # разбор ошибочно положил бы Scotland в город, а Switzerland в страну.
    file.location_metadata = 'Scotland, England, Switzerland'
    file.location_sublocation = None
    file.location_city = 'Edinburgh'
    file.location_province_state = 'Scotland'
    file.location_country = 'United Kingdom'

    payload = build_stock_iptc_payload(file, StockPlatform.GETTY_IMAGES)

    assert payload.city == 'Edinburgh'
    assert payload.province_state == 'Scotland'
    assert payload.country_name == 'United Kingdom'


def test_manual_location_edit_clears_structured_components():
    job = _build_completed_job()
    file = job.files[0]
    file.location_city = 'Edinburgh'
    file.location_province_state = 'Scotland'
    file.location_country = 'United Kingdom'

    with TestClient(app) as client:
        response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/{file.file_id}/metadata',
            json={'location_metadata': 'Paris, France'},
        )

    assert response.status_code == 200
    assert file.location_metadata == 'Paris, France'
    assert file.location_city is None
    assert file.location_province_state is None
    assert file.location_country is None

    payload = build_stock_iptc_payload(file, StockPlatform.GETTY_IMAGES)
    assert payload.city == 'Paris'
    assert payload.country_name == 'France'


@pytest.mark.parametrize(
    'stock_platform',
    [
        StockPlatform.GETTY_IMAGES,
        StockPlatform.SHUTTERSTOCK,
        StockPlatform.ADOBE_STOCK,
    ],
)
def test_iptc_payload_preserves_country_only_location_for_every_stock(
    stock_platform: StockPlatform,
):
    job = _build_completed_job()
    file = job.files[0]
    file.location_metadata = 'France'

    payload = build_stock_iptc_payload(file, stock_platform)

    assert payload.city is None
    assert payload.province_state is None
    assert payload.country_name == 'France'


def test_getty_csv_contains_all_stock_specific_preview_fields():
    job = _build_completed_job()
    file = job.files[0]
    file.categories = ['Travel', 'Nature']
    file.category_2 = 'Nature'
    file.license_type = 'editorial'
    file.is_editorial = True
    file.editorial_caption = 'London, England - Historic landmark'
    file.editorial_date = '2026-07-13'
    file.location_metadata = 'London, England, United Kingdom'
    file.releases = ['model-release.pdf']

    rows = list(
        csv.DictReader(
            StringIO(generate_metadata_csv(job, StockPlatform.GETTY_IMAGES))
        )
    )

    assert list(rows[0]) == [
        'Filename',
        'Title',
        'Description',
        'Keywords',
        'Category 1',
        'Category 2',
        'License Type',
        'Editorial',
        'Editorial Caption',
        'Editorial Date',
        'Location',
        'Releases',
    ]
    assert rows[0]['Category 1'] == 'Travel'
    assert rows[0]['Category 2'] == 'Nature'
    assert rows[0]['License Type'] == 'editorial'
    assert rows[0]['Editorial Caption'] == (
        'London, England - Historic landmark'
    )
    assert rows[0]['Editorial Date'] == '2026-07-13'


def test_adobe_csv_contains_all_stock_specific_preview_fields():
    job = _build_completed_job()
    file = job.files[0]
    file.editorial_caption = 'Editorial caption'
    file.ai_generated_content_disclosure = True
    file.is_illustration = False
    file.mature_content = True

    rows = list(
        csv.DictReader(
            StringIO(generate_metadata_csv(job, StockPlatform.ADOBE_STOCK))
        )
    )

    assert list(rows[0]) == [
        'Filename',
        'Title',
        'Description',
        'Keywords',
        'Category',
        'Editorial',
        'Editorial Caption',
        'Location',
        'Releases',
        'AI Disclosure',
        'Illustration',
        'Mature Content',
    ]
    assert rows[0]['Editorial Caption'] == 'Editorial caption'
    assert rows[0]['AI Disclosure'] == 'Yes'
    assert rows[0]['Illustration'] == 'No'
    assert rows[0]['Mature Content'] == 'Yes'


def test_export_download_uses_requested_stock_platform_without_mutating_job():
    job = _build_completed_job()
    job.stock_platform = StockPlatform.SHUTTERSTOCK

    with TestClient(app) as client:
        response = client.get(
            f'/api/v1/jobs/{job.job_id}/export',
            params={'csv': 'true', 'stock_platform': 'adobe_stock'},
        )

    assert response.status_code == 200
    assert 'text/csv' in response.headers.get('content-type', '')
    assert f'{job.job_id}_adobe_stock.csv' in response.headers.get(
        'content-disposition',
        '',
    )
    assert response.text.startswith(
        'Filename,Title,Description,Keywords,Category,Editorial,'
        'Editorial Caption,Location,Releases,AI Disclosure,Illustration,'
        'Mature Content'
    )
    assert storage._jobs[job.job_id].stock_platform == (
        StockPlatform.SHUTTERSTOCK
    )


def test_start_export_updates_job_to_requested_stock_platform():
    job = _build_completed_job()
    job.stock_platform = StockPlatform.SHUTTERSTOCK

    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/jobs/{job.job_id}/export',
            params={'csv': 'true', 'stock_platform': 'adobe_stock'},
        )

    assert response.status_code == 200
    assert storage._jobs[job.job_id].stock_platform == (
        StockPlatform.ADOBE_STOCK
    )


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


def test_bulk_selection_with_file_ids_touches_only_listed_files():
    job = _build_completed_job(
        files=[
            _build_completed_file(
                filename=f'image-{index:03}.jpg',
                original_filename=f'image-{index:03}.jpg',
                title=f'Image {index:03} title',
            )
            for index in range(1, 4)
        ]
    )

    for file in job.files:
        file.selected_for_export = False

    kept_file = job.files[1]

    with TestClient(app) as client:
        response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/selection',
            json={
                'selected_for_export': True,
                'file_ids': [str(kept_file.file_id)],
            },
        )

    assert response.status_code == 200
    assert response.json()['updated_count'] == 1
    assert response.json()['total_items'] == 3
    assert [file.selected_for_export for file in job.files] == [
        False,
        True,
        False,
    ]


def test_bulk_selection_ignores_unknown_file_ids():
    job = _build_completed_job()

    for file in job.files:
        file.selected_for_export = True

    with TestClient(app) as client:
        response = client.patch(
            f'/api/v1/jobs/{job.job_id}/files/selection',
            json={
                'selected_for_export': False,
                'file_ids': [str(uuid4())],
            },
        )

    assert response.status_code == 200
    assert response.json()['updated_count'] == 0
    assert all(file.selected_for_export for file in job.files)


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
            json={'ai_provider': 'ollama', 'stock_platform': 'getty_images'},
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
    assert stored_first_file['regenerate_attempts'][0]['stock_platform'] == (
        'getty_images'
    )
    assert (
        stored_first_file['regenerate_attempts'][0]['previous_metadata'][
            'title'
        ]
        == 'Edited title before regenerate'
    )
    assert stored_second_file['title'] == second_original_title
    assert job_response.json()['stock_platform'] == 'getty_images'


def test_upload_appends_files_to_queued_job_and_updates_context():
    job = ProcessingJob(
        shooting_context='Old context',
        files=[
            ProcessingJobFile(
                filename='existing.jpg',
                original_filename='existing.jpg',
            )
        ],
    )
    storage._jobs[job.job_id] = job

    files = [
        (
            'files',
            ('first-new.jpg', _build_tiny_jpeg_bytes(), 'image/jpeg'),
        ),
        (
            'files',
            ('second-new.jpg', _build_tiny_jpeg_bytes(), 'image/jpeg'),
        ),
    ]

    with TestClient(app) as client:
        response = client.post(
            '/api/v1/jobs/upload',
            data={
                'job_id': str(job.job_id),
                'shooting_context': 'Updated context',
            },
            files=files,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['job_id'] == str(job.job_id)
    assert payload['shooting_context'] == 'Updated context'
    assert [file['original_filename'] for file in payload['files']] == [
        'existing.jpg',
        'first-new.jpg',
        'second-new.jpg',
    ]
    assert [file['status'] for file in payload['files']] == [
        'queued',
        'queued',
        'queued',
    ]
    assert len(storage._jobs[job.job_id].files) == 3


def test_upload_returns_404_for_missing_append_target_without_saving_file():
    upload_dir = get_runtime_directories().uploads_dir

    with TestClient(app) as client:
        response = client.post(
            '/api/v1/jobs/upload',
            data={'job_id': str(uuid4())},
            files={
                'files': (
                    'orphan.jpg',
                    _build_tiny_jpeg_bytes(),
                    'image/jpeg',
                ),
            },
        )

    assert response.status_code == 404
    assert response.json()['detail'] == 'Job not found'
    assert list(upload_dir.iterdir()) == []


def test_upload_rejects_append_after_processing_started_without_mutating_job():
    job = ProcessingJob(
        status=JobStatus.PROCESSING,
        files=[
            ProcessingJobFile(
                filename='existing.jpg',
                original_filename='existing.jpg',
            )
        ],
    )
    storage._jobs[job.job_id] = job
    upload_dir = get_runtime_directories().uploads_dir

    with TestClient(app) as client:
        response = client.post(
            '/api/v1/jobs/upload',
            data={'job_id': str(job.job_id)},
            files={
                'files': (
                    'blocked.jpg',
                    _build_tiny_jpeg_bytes(),
                    'image/jpeg',
                ),
            },
        )

    assert response.status_code == 400
    assert response.json()['detail'] == (
        'Cannot add files after processing has started'
    )
    assert len(storage._jobs[job.job_id].files) == 1
    assert storage._jobs[job.job_id].files[0].original_filename == (
        'existing.jpg'
    )
    assert list(upload_dir.iterdir()) == []


def test_upload_rejects_duplicate_filenames_without_saving_files():
    upload_dir = get_runtime_directories().uploads_dir

    files = [
        (
            'files',
            ('duplicate.jpg', _build_tiny_jpeg_bytes(), 'image/jpeg'),
        ),
        (
            'files',
            ('duplicate.jpg', _build_tiny_jpeg_bytes(), 'image/jpeg'),
        ),
    ]

    with TestClient(app) as client:
        response = client.post('/api/v1/jobs/upload', files=files)

    assert response.status_code == 400
    assert response.json()['detail'] == (
        'Duplicate files are not allowed: duplicate.jpg'
    )
    assert list(upload_dir.iterdir()) == []


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


def _build_tiny_jpeg_bytes() -> bytes:
    buffer = BytesIO()
    Image.new('RGB', (1, 1), color='white').save(buffer, format='JPEG')
    return buffer.getvalue()


def _iptc_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode('utf_8')

    return str(value)


def _iptc_list(values: object) -> list[str]:
    if not isinstance(values, list):
        return [_iptc_text(values)]

    return [_iptc_text(value) for value in values]
