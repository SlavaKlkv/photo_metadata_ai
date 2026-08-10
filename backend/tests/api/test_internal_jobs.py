from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_internal_jobs_can_be_created_and_listed():
    with TestClient(app) as client:
        create_response = client.post(
            '/api/v1/internal/',
            json={
                'files': [{'original_filename': 'photo.jpg'}],
                'shooting_context': 'studio',
            },
        )
        list_response = client.get('/api/v1/internal/')

    assert create_response.status_code == 200
    created = create_response.json()
    assert created['files'][0]['filename'] == 'photo.jpg'
    assert created['shooting_context'] == 'studio'
    assert list_response.status_code == 200
    assert [job['job_id'] for job in list_response.json()] == [
        created['job_id']
    ]


def test_internal_embed_returns_404_for_missing_job():
    with TestClient(app) as client:
        response = client.post(
            f'/api/v1/internal/{uuid4()}/files/{uuid4()}/embed-metadata'
        )

    assert response.status_code == 404
    assert response.json()['detail'] == 'Job not found'


def test_internal_embed_returns_404_for_missing_file():
    with TestClient(app) as client:
        create_response = client.post(
            '/api/v1/internal/',
            json={'files': [{'original_filename': 'photo.jpg'}]},
        )
        response = client.post(
            '/api/v1/internal/'
            f'{create_response.json()["job_id"]}/files/{uuid4()}/embed-metadata'
        )

    assert response.status_code == 404
    assert response.json()['detail'] == 'File not found'
