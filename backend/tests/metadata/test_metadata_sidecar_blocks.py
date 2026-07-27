"""
Проверки того, что экспортированный JPG несёт метаданные во всех трёх
блоках: IPTC IIM, XMP и EXIF.

Тесты намеренно разбирают файл побайтово, а не через iptcinfo3: тот
слишком терпим к повреждённой структуре и читает даже то, что штатные
просмотрщики (Finder, Просмотр, Фото) уже игнорируют. Именно такой
разрыв «в коде метаданные есть, в macOS их не видно» эти тесты и ловят.
"""

import struct
from pathlib import Path

import piexif
import pytest
from PIL import Image

from app.core.enums import FileStatus
from app.schemas.job import ProcessingJobFile
from app.services.metadata.metadata_embedding import (
    IPTCEmbeddingPayload,
    embed_metadata_into_jpg,
)

XMP_IDENTIFIER = b'http://ns.adobe.com/xap/1.0/\x00'


@pytest.fixture
def jpg_file(tmp_path: Path) -> Path:
    file_path = tmp_path / 'photo.jpg'
    exif_bytes = piexif.dump(
        {
            '0th': {piexif.ImageIFD.Make: b'TestCam'},
            'Exif': {},
            'GPS': {},
            '1st': {},
            'thumbnail': None,
        }
    )
    Image.new('RGB', (64, 48), (60, 120, 200)).save(
        file_path,
        quality=90,
        exif=exif_bytes,
    )
    return file_path


@pytest.fixture
def payload() -> IPTCEmbeddingPayload:
    return IPTCEmbeddingPayload(
        object_name='Sunset over the coastal city',
        caption_abstract='A calm evening on the shoreline',
        keywords=['sunset', 'coast', 'город'],
        supplemental_category=['Nature'],
        city='Москва',
        province_state='Moscow oblast',
        country_name='Россия',
        date_created='2026-07-13',
        special_instructions='license=commercial',
    )


def _job_file() -> ProcessingJobFile:
    return ProcessingJobFile(
        filename='photo.jpg',
        original_filename='photo.jpg',
        status=FileStatus.COMPLETED,
    )


def _walk_segments(file_path: Path) -> list[tuple[int, bytes]]:
    """
    Возвращает [(маркер, тело)] всех сегментов до SOS.

    Заодно это проверка структуры: если длина сегмента посчитана неверно,
    обход упрётся в не-0xFF байт и тест увидит меньше сегментов.
    """
    data = file_path.read_bytes()
    assert data[:2] == b'\xff\xd8', 'файл перестал быть JPEG'

    segments: list[tuple[int, bytes]] = []
    pos = 2

    while pos + 4 <= len(data):
        assert data[pos] == 0xFF, (
            f'структура JPEG повреждена: по смещению {pos} ожидался маркер'
        )
        marker = data[pos + 1]

        if marker == 0xDA:
            break

        length = struct.unpack_from('>H', data, pos + 2)[0]
        segments.append((marker, data[pos + 4 : pos + 2 + length]))
        pos += 2 + length

    return segments


def _find_segment(file_path: Path, marker: int, prefix: bytes) -> bytes | None:
    for segment_marker, body in _walk_segments(file_path):
        if segment_marker == marker and body.startswith(prefix):
            return body

    return None


def _read_xmp(file_path: Path) -> str:
    body = _find_segment(file_path, 0xE1, XMP_IDENTIFIER)
    assert body is not None, 'XMP-сегмент отсутствует'

    return body[len(XMP_IDENTIFIER) :].decode('utf-8')


def test_embed_writes_iptc_xmp_and_exif_blocks(
    jpg_file: Path,
    payload: IPTCEmbeddingPayload,
):
    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=jpg_file)

    assert _find_segment(jpg_file, 0xED, b'Photoshop 3.0\x00') is not None
    assert _find_segment(jpg_file, 0xE1, XMP_IDENTIFIER) is not None
    assert _find_segment(jpg_file, 0xE1, b'Exif\x00\x00') is not None


def test_xmp_carries_title_description_and_keywords(
    jpg_file: Path,
    payload: IPTCEmbeddingPayload,
):
    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=jpg_file)

    xmp = _read_xmp(jpg_file)

    assert 'Sunset over the coastal city' in xmp
    assert 'A calm evening on the shoreline' in xmp
    assert '<dc:subject>' in xmp
    for keyword in ('sunset', 'coast', 'город'):
        assert f'<rdf:li>{keyword}</rdf:li>' in xmp
    assert '<photoshop:City>Москва</photoshop:City>' in xmp
    assert '<photoshop:Country>Россия</photoshop:Country>' in xmp
    # XMP требует ISO-дату, а не IPTC-формат YYYYMMDD
    assert '<photoshop:DateCreated>2026-07-13</photoshop:DateCreated>' in xmp


def test_xmp_escapes_special_characters(jpg_file: Path):
    embed_metadata_into_jpg(
        _job_file(),
        payload=IPTCEmbeddingPayload(
            object_name='Tom & Jerry <toys>',
            caption_abstract='Cats & dogs',
            keywords=['a & b'],
            supplemental_category=[],
        ),
        file_path=jpg_file,
    )

    xmp = _read_xmp(jpg_file)

    assert 'Tom &amp; Jerry &lt;toys&gt;' in xmp
    assert '<toys>' not in xmp


def test_exif_gets_description_and_keeps_original_tags(
    jpg_file: Path,
    payload: IPTCEmbeddingPayload,
):
    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=jpg_file)

    exif = piexif.load(str(jpg_file))
    zeroth = exif['0th']

    assert zeroth[piexif.ImageIFD.ImageDescription].decode('utf-8') == (
        'A calm evening on the shoreline'
    )
    assert (
        bytes(zeroth[piexif.ImageIFD.XPTitle])
        .decode('utf-16le')
        .rstrip('\x00')
        == 'Sunset over the coastal city'
    )
    assert (
        bytes(zeroth[piexif.ImageIFD.XPKeywords])
        .decode('utf-16le')
        .rstrip('\x00')
        == 'sunset; coast; город'
    )
    # съёмочные теги исходника переживают встраивание
    assert zeroth[piexif.ImageIFD.Make] == b'TestCam'


def test_repeated_embedding_keeps_single_xmp_segment(
    jpg_file: Path,
    payload: IPTCEmbeddingPayload,
):
    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=jpg_file)
    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=jpg_file)

    xmp_segments = [
        body
        for marker, body in _walk_segments(jpg_file)
        if marker == 0xE1 and body.startswith(XMP_IDENTIFIER)
    ]

    assert len(xmp_segments) == 1


def test_embedding_keeps_image_readable(
    jpg_file: Path,
    payload: IPTCEmbeddingPayload,
):
    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=jpg_file)

    with Image.open(jpg_file) as image:
        image.load()
        assert image.size == (64, 48)


def test_embedding_works_without_exif_in_source(
    tmp_path: Path,
    payload: IPTCEmbeddingPayload,
):
    file_path = tmp_path / 'no-exif.jpg'
    Image.new('RGB', (32, 24), 'red').save(file_path, quality=90)

    embed_metadata_into_jpg(_job_file(), payload=payload, file_path=file_path)

    assert _find_segment(file_path, 0xE1, XMP_IDENTIFIER) is not None
    assert _find_segment(file_path, 0xED, b'Photoshop 3.0\x00') is not None
    exif = piexif.load(str(file_path))
    assert exif['0th'][piexif.ImageIFD.ImageDescription].decode('utf-8') == (
        'A calm evening on the shoreline'
    )
