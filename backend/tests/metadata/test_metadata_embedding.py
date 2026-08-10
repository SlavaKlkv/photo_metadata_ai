from pathlib import Path

import pytest
from iptcinfo3 import IPTCInfo
from PIL import Image

from app.services.metadata.metadata_embedding import (
    _IPTC_UTF8_MARKER,
    IPTCEmbeddingPayload,
    _embed_iptc_metadata,
)


@pytest.fixture
def jpg_file(tmp_path: Path) -> Path:
    file_path = tmp_path / 'photo.jpg'
    Image.new('RGB', (32, 16), (60, 120, 200)).save(file_path, quality=90)
    return file_path


def _read_iptc(file_path: Path) -> IPTCInfo:
    # iptcinfo3 не умеет автодетектить ESC%G-маркер (баг с длиной поля),
    # поэтому кодировку задаём явно — так мы проверяем, что встроенные
    # байты действительно валидный UTF-8, а структура блока не повреждена.
    return IPTCInfo(str(file_path), inp_charset='utf_8')


def test_embed_writes_utf8_charset_marker(jpg_file: Path):
    _embed_iptc_metadata(
        jpg_file,
        IPTCEmbeddingPayload(
            object_name='Test Title',
            caption_abstract='Caption',
            keywords=['alpha', 'beta'],
            supplemental_category=['Nature'],
        ),
    )

    data = jpg_file.read_bytes()
    # Маркер стоит первым датасетом внутри IPTC-ресурса 8BIM 0x0404.
    resource_start = data.index(b'8BIM\x04\x04')
    iptc_data_start = data.index(b'\x1c', resource_start + 6)
    assert data[iptc_data_start:].startswith(_IPTC_UTF8_MARKER)

    info = _read_iptc(jpg_file)
    assert info['object name'] == 'Test Title'
    assert info['keywords'] == ['alpha', 'beta']


def test_embed_cyrillic_metadata_round_trip(jpg_file: Path):
    _embed_iptc_metadata(
        jpg_file,
        IPTCEmbeddingPayload(
            object_name='Москва зимой',
            caption_abstract='Вид на Кремль вечером',
            keywords=['москва', 'зима'],
            supplemental_category=['Город'],
            city='Москва',
        ),
    )

    assert _IPTC_UTF8_MARKER in jpg_file.read_bytes()

    info = _read_iptc(jpg_file)
    assert info['object name'] == 'Москва зимой'
    assert info['keywords'] == ['москва', 'зима']
    assert info['city'] == 'Москва'


def test_repeated_embed_does_not_duplicate_marker(jpg_file: Path):
    for title in ('Первый', 'Второй'):
        _embed_iptc_metadata(
            jpg_file,
            IPTCEmbeddingPayload(
                object_name=title,
                caption_abstract='x',
                keywords=['a'],
                supplemental_category=['S'],
            ),
        )

    data = jpg_file.read_bytes()
    assert data.count(_IPTC_UTF8_MARKER) == 1
    assert _read_iptc(jpg_file)['object name'] == 'Второй'


def test_embed_keeps_image_decodable(jpg_file: Path):
    _embed_iptc_metadata(
        jpg_file,
        IPTCEmbeddingPayload(
            object_name='Заголовок',
            caption_abstract='Описание',
            keywords=['ключ'],
            supplemental_category=['S'],
        ),
    )

    with Image.open(jpg_file) as image:
        image.load()
        assert image.size == (32, 16)
