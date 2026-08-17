"""Тесты кеширования встроенной сборки фронтенда.

Регрессия: `index.html` раздавался без `Cache-Control`, браузер кешировал
его эвристически и после обновления приложения открывал старую разметку со
ссылками на бандлы прежней сборки — свежие правки интерфейса не появлялись.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import mount_frontend


@pytest.fixture
def client(tmp_path):
    (tmp_path / 'index.html').write_text(
        '<html><link href="/static/css/main.abc123.css"></html>',
        encoding='utf-8',
    )
    static_dir = tmp_path / 'static' / 'css'
    static_dir.mkdir(parents=True)
    (static_dir / 'main.abc123.css').write_text(
        '.a{color:red}',
        encoding='utf-8',
    )

    app = FastAPI()
    mount_frontend(app, tmp_path)
    return TestClient(app)


def test_index_is_never_cached(client):
    response = client.get('/')

    assert response.status_code == 200
    assert 'no-store' in response.headers['cache-control']


def test_index_by_explicit_path_is_never_cached(client):
    response = client.get('/index.html')

    assert response.status_code == 200
    assert 'no-store' in response.headers['cache-control']


def test_hashed_assets_are_cached_long(client):
    """Имя бандла меняется вместе с содержимым — его можно кешировать."""
    response = client.get('/static/css/main.abc123.css')

    assert response.status_code == 200
    assert 'immutable' in response.headers['cache-control']
    assert 'no-store' not in response.headers['cache-control']


def test_cache_control_survives_not_modified(client):
    """304 не должен возвращать ответ без запрета кеширования."""
    first = client.get('/index.html')
    revalidated = client.get(
        '/index.html',
        headers={'if-none-match': first.headers['etag']},
    )

    assert revalidated.status_code == 304
    assert 'no-store' in revalidated.headers['cache-control']
