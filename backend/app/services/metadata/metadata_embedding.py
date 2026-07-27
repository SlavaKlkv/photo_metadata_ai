import re
import struct
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import piexif
import structlog
from fastapi import HTTPException
from iptcinfo3 import IPTCInfo

from app.core.constants import ALLOWED_IMAGE_SUFFIXES
from app.core.runtime import get_runtime_directories, resolve_path_in_base
from app.schemas.job import ProcessingJobFile

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class IPTCLocation:
    sublocation: str | None = None
    city: str | None = None
    province_state: str | None = None
    country_name: str | None = None


@dataclass(frozen=True)
class IPTCEmbeddingPayload:
    object_name: str
    caption_abstract: str
    keywords: list[str]
    supplemental_category: list[str]
    sublocation: str | None = None
    city: str | None = None
    province_state: str | None = None
    country_name: str | None = None
    date_created: str | None = None
    special_instructions: str | None = None


def embed_metadata_into_jpg(
    file: ProcessingJobFile,
    payload: IPTCEmbeddingPayload | None = None,
    file_path: Path | None = None,
) -> None:
    """
    Записывает metadata в IPTC-поля JPG-файла.
    """
    logger.info(
        'metadata_embedding_started',
        file_id=str(file.file_id),
        filename=file.filename,
    )
    target_file_path = file_path or get_upload_file_path(file.filename)

    _validate_jpg_file_path(target_file_path)

    try:
        effective_payload = payload or _build_default_iptc_payload(file)
        _embed_iptc_metadata(target_file_path, effective_payload)
        # IPTC IIM читают Adobe и стоки, но не Finder, Просмотр и Фото:
        # им нужен XMP, а части старых программ — EXIF. Пишем все три,
        # иначе метаданные «не видно» в штатных просмотрщиках macOS.
        _embed_exif_metadata(target_file_path, effective_payload)
        _embed_xmp_metadata(target_file_path, effective_payload)

        logger.info(
            'metadata_embedding_completed',
            file_id=str(file.file_id),
            filename=file.filename,
            file_path=str(target_file_path),
            keywords_count=len(effective_payload.keywords),
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception(
            'metadata_embedding_failed',
            file_id=str(file.file_id),
            filename=file.filename,
            error=str(error),
        )
        raise HTTPException(
            status_code=500,
            detail='Failed to embed metadata into JPG',
        ) from error


def get_upload_file_path(filename: str) -> Path:
    """
    Формирует путь к файлу внутри директории uploads.
    """
    upload_dir = get_runtime_directories().uploads_dir

    try:
        file_path = resolve_path_in_base(upload_dir, Path(filename).name)
    except ValueError as error:
        logger.warning(
            'upload_file_path_rejected',
            filename=filename,
            error=str(error),
        )
        raise HTTPException(
            status_code=400,
            detail='Unsafe file path',
        ) from error

    logger.debug(
        'upload_file_path_resolved',
        filename=filename,
        resolved_path=str(file_path),
    )

    return file_path


def _validate_jpg_file_path(file_path: Path) -> None:
    """
    Проверяет, что файл существует и является JPG/JPEG.
    """

    if file_path.suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        logger.warning(
            'metadata_embedding_invalid_file_type',
            file_path=str(file_path),
            file_extension=file_path.suffix.lower(),
        )
        raise HTTPException(
            status_code=400,
            detail='Metadata embedding is supported only for JPG files',
        )

    if not file_path.exists():
        logger.warning(
            'metadata_embedding_file_not_found',
            file_path=str(file_path),
        )
        raise HTTPException(
            status_code=404,
            detail='Uploaded file not found',
        )


def _embed_iptc_metadata(
    file_path: Path,
    payload: IPTCEmbeddingPayload,
) -> None:
    """
    Встраивает IPTC metadata в JPG.
    """
    try:
        iptc_info = IPTCInfo(
            str(file_path),
            force=True,
            out_charset='utf_8',
        )
        iptc_info['object name'] = payload.object_name
        iptc_info['caption/abstract'] = payload.caption_abstract
        iptc_info['keywords'] = _normalize_iptc_list(payload.keywords)
        iptc_info['supplemental category'] = _normalize_iptc_list(
            payload.supplemental_category
        )

        _set_iptc_optional_text(
            iptc_info,
            'sub-location',
            payload.sublocation,
        )
        _set_iptc_optional_text(
            iptc_info,
            'city',
            payload.city,
        )
        _set_iptc_optional_text(
            iptc_info,
            'province/state',
            payload.province_state,
        )
        _set_iptc_optional_text(
            iptc_info,
            'country/primary location name',
            payload.country_name,
        )
        _set_iptc_optional_text(
            iptc_info,
            'date created',
            _normalize_iptc_date(payload.date_created),
        )
        _set_iptc_optional_text(
            iptc_info,
            'special instructions',
            payload.special_instructions,
        )

        iptc_info.save(options={'overwrite': True})
        _ensure_iptc_utf8_marker(file_path)
    except Exception as error:
        logger.exception(
            'iptc_embedding_failed',
            file_path=str(file_path),
            error=str(error),
        )
        raise HTTPException(
            status_code=500,
            detail='Failed to embed IPTC metadata into JPG',
        ) from error


# IPTC dataset 1:90 (CodedCharacterSet) со значением ESC % G — признак UTF-8.
# iptcinfo3 пишет текст в UTF-8, но сам маркер не записывает, из-за чего
# читатели (macOS, Adobe, стоки) трактуют байты как Latin-1 и портят кириллицу.
_IPTC_UTF8_MARKER = b'\x1c\x01\x5a\x00\x03\x1b\x25\x47'


def _ensure_iptc_utf8_marker(file_path: Path) -> None:
    data = bytearray(file_path.read_bytes())
    pos = 2

    while pos + 4 <= len(data) and data[pos] == 0xFF:
        marker = data[pos + 1]
        if marker == 0xDA:
            return
        segment_length = struct.unpack_from('>H', data, pos + 2)[0]

        if marker == 0xED and data[pos + 4 : pos + 18] == b'Photoshop 3.0\x00':
            resource_pos = pos + 18
            segment_end = pos + 2 + segment_length

            while resource_pos + 12 <= segment_end:
                if data[resource_pos : resource_pos + 4] != b'8BIM':
                    return
                resource_id = struct.unpack_from('>H', data, resource_pos + 4)[
                    0
                ]
                name_length = data[resource_pos + 6]
                name_padded = ((1 + name_length) + 1) // 2 * 2
                size_pos = resource_pos + 6 + name_padded
                resource_size = struct.unpack_from('>I', data, size_pos)[0]
                data_pos = size_pos + 4

                if resource_id != 0x0404:
                    resource_pos = (
                        data_pos + resource_size + (resource_size % 2)
                    )
                    continue

                iptc_block = data[data_pos : data_pos + resource_size]
                if iptc_block.startswith(b'\x1c\x01'):
                    return

                new_size = resource_size + len(_IPTC_UTF8_MARKER)
                struct.pack_into('>I', data, size_pos, new_size)
                struct.pack_into(
                    '>H',
                    data,
                    pos + 2,
                    segment_length + len(_IPTC_UTF8_MARKER),
                )
                data[data_pos:data_pos] = _IPTC_UTF8_MARKER
                file_path.write_bytes(bytes(data))
                return

            return

        pos += 2 + segment_length


_XMP_IDENTIFIER = b'http://ns.adobe.com/xap/1.0/\x00'


def _embed_exif_metadata(
    file_path: Path,
    payload: IPTCEmbeddingPayload,
) -> None:
    """
    Дублирует заголовок, описание и ключевые слова в EXIF.

    ImageDescription читают почти все программы, XP*-поля — проводник
    Windows. Остальной EXIF (съёмочные параметры, ориентация) сохраняется:
    piexif заменяет только APP1 Exif, не трогая изображение.
    """
    try:
        exif_dict = piexif.load(str(file_path))
    except Exception:
        logger.warning('exif_load_failed', file_path=str(file_path))
        exif_dict = {'0th': {}, 'Exif': {}, '1st': {}, 'GPS': {}, 'ifd1': {}}

    zeroth = exif_dict.setdefault('0th', {})
    description = payload.caption_abstract.strip()
    title = payload.object_name.strip()
    keywords = '; '.join(_normalize_iptc_list(payload.keywords))

    if description:
        zeroth[piexif.ImageIFD.ImageDescription] = description.encode('utf-8')
        zeroth[piexif.ImageIFD.XPComment] = _encode_xp_field(description)

    if title:
        zeroth[piexif.ImageIFD.XPTitle] = _encode_xp_field(title)

    if keywords:
        zeroth[piexif.ImageIFD.XPKeywords] = _encode_xp_field(keywords)

    # Миниатюра из исходника нередко невалидна для повторного dump,
    # а нужна она только просмотрщикам — без неё файл остаётся корректным
    exif_dict.pop('thumbnail', None)
    exif_dict.pop('1st', None)

    try:
        piexif.insert(piexif.dump(exif_dict), str(file_path))
    except Exception:
        logger.warning('exif_embedding_skipped', file_path=str(file_path))


def _encode_xp_field(value: str) -> bytes:
    """
    XP*-поля EXIF хранятся как UTF-16LE с нулевым терминатором.
    """
    return value.encode('utf-16le') + b'\x00\x00'


def _embed_xmp_metadata(
    file_path: Path,
    payload: IPTCEmbeddingPayload,
) -> None:
    """
    Записывает XMP-пакет — именно его читают Finder, Просмотр и Фото.

    Существующий XMP-сегмент заменяется целиком, прочие сегменты
    (EXIF, ICC, IPTC) остаются на месте.
    """
    packet = _build_xmp_packet(payload)
    segment = (
        b'\xff\xe1'
        + struct.pack('>H', len(_XMP_IDENTIFIER) + len(packet) + 2)
        + _XMP_IDENTIFIER
        + packet
    )

    data = bytearray(file_path.read_bytes())
    insert_pos = 2
    pos = 2

    while pos + 4 <= len(data) and data[pos] == 0xFF:
        marker = data[pos + 1]

        if marker == 0xDA:
            break

        segment_length = struct.unpack_from('>H', data, pos + 2)[0]
        segment_end = pos + 2 + segment_length
        is_xmp = (
            marker == 0xE1
            and data[pos + 4 : pos + 4 + len(_XMP_IDENTIFIER)]
            == _XMP_IDENTIFIER
        )

        if is_xmp:
            del data[pos:segment_end]
            continue

        # XMP кладём после APP0/APP1, как это делают Adobe и ImageIO
        if marker in (0xE0, 0xE1):
            insert_pos = segment_end

        pos = segment_end

    data[insert_pos:insert_pos] = segment
    file_path.write_bytes(bytes(data))


def _build_xmp_packet(payload: IPTCEmbeddingPayload) -> bytes:
    keywords = _normalize_iptc_list(payload.keywords)
    categories = _normalize_iptc_list(payload.supplemental_category)
    title = payload.object_name.strip()
    description = payload.caption_abstract.strip()

    properties: list[str] = []

    if title:
        properties.append(
            '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">'
            f'{xml_escape(title)}</rdf:li></rdf:Alt></dc:title>'
        )
        properties.append(
            f'<photoshop:Headline>{xml_escape(title)}</photoshop:Headline>'
        )

    if description:
        properties.append(
            '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">'
            f'{xml_escape(description)}</rdf:li></rdf:Alt></dc:description>'
        )

    if keywords:
        items = ''.join(
            f'<rdf:li>{xml_escape(keyword)}</rdf:li>' for keyword in keywords
        )
        properties.append(
            f'<dc:subject><rdf:Bag>{items}</rdf:Bag></dc:subject>'
        )

    if categories:
        items = ''.join(
            f'<rdf:li>{xml_escape(category)}</rdf:li>'
            for category in categories
        )
        properties.append(
            '<photoshop:SupplementalCategories><rdf:Bag>'
            f'{items}</rdf:Bag></photoshop:SupplementalCategories>'
        )

    for tag, value in (
        ('photoshop:City', payload.city),
        ('photoshop:State', payload.province_state),
        ('photoshop:Country', payload.country_name),
        ('Iptc4xmpCore:Location', payload.sublocation),
        ('photoshop:Instructions', payload.special_instructions),
    ):
        normalized = (value or '').strip()
        if normalized:
            name = tag.split(':')[1]
            properties.append(
                f'<{tag}>{xml_escape(normalized)}</{tag.split(":")[0]}:{name}>'
            )

    date_created = _normalize_xmp_date(payload.date_created)
    if date_created:
        properties.append(
            f'<photoshop:DateCreated>{date_created}</photoshop:DateCreated>'
        )

    body = ''.join(properties)
    packet = (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description rdf:about=""'
        ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
        ' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"'
        ' xmlns:Iptc4xmpCore='
        '"http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">'
        f'{body}'
        '</rdf:Description></rdf:RDF></x:xmpmeta>'
        '<?xpacket end="w"?>'
    )

    return packet.encode('utf-8')


def _normalize_xmp_date(value: str | None) -> str | None:
    """
    XMP хранит дату в ISO-8601, в отличие от IPTC-формата YYYYMMDD.
    """
    normalized = _normalize_iptc_date(value)

    if normalized is None:
        return None

    return f'{normalized[:4]}-{normalized[4:6]}-{normalized[6:]}'


def resolve_iptc_location(file: ProcessingJobFile) -> IPTCLocation:
    """
    Возвращает IPTC-локацию из структурированных полей файла.

    Если структурированные компоненты отсутствуют (например, локация была
    отредактирована вручную одной строкой), выполняется fallback на разбор
    строки ``location_metadata``.
    """
    structured = IPTCLocation(
        sublocation=file.location_sublocation,
        city=file.location_city,
        province_state=file.location_province_state,
        country_name=file.location_country,
    )

    if any(
        (
            structured.sublocation,
            structured.city,
            structured.province_state,
            structured.country_name,
        )
    ):
        return structured

    return normalize_iptc_location(file.location_metadata)


def _build_default_iptc_payload(
    file: ProcessingJobFile,
) -> IPTCEmbeddingPayload:
    location = resolve_iptc_location(file)

    return IPTCEmbeddingPayload(
        object_name=file.title or '',
        caption_abstract=file.description or '',
        keywords=list(file.keywords),
        supplemental_category=list(file.categories),
        sublocation=location.sublocation,
        city=location.city,
        province_state=location.province_state,
        country_name=location.country_name,
        date_created=file.editorial_date if file.is_editorial else None,
    )


def normalize_iptc_location(value: str | None) -> IPTCLocation:
    """
    Раскладывает строку локации по стандартным IPTC location-полям.
    """
    if value is None:
        return IPTCLocation()

    normalized = ' '.join(value.strip().split())
    if not normalized:
        return IPTCLocation()

    normalized_lower = normalized.lower()
    explicit_field: str | None = None
    for prefix, field in (
        ('city=', 'city'),
        ('country=', 'country'),
        ('location=', 'location'),
    ):
        if normalized_lower.startswith(prefix):
            explicit_field = field
            normalized = normalized[len(prefix) :].strip()
            break

    location_parts = [
        part.strip()
        for part in re.split(r'\s*[,;|/]\s*', normalized)
        if part.strip()
    ]
    if not location_parts:
        return IPTCLocation()

    if len(location_parts) == 1:
        if explicit_field == 'city':
            return IPTCLocation(city=location_parts[0])

        return IPTCLocation(country_name=location_parts[0])

    if len(location_parts) == 2:
        return IPTCLocation(
            city=location_parts[0],
            country_name=location_parts[1],
        )

    if len(location_parts) == 3:
        return IPTCLocation(
            city=location_parts[0],
            province_state=location_parts[1],
            country_name=location_parts[2],
        )

    return IPTCLocation(
        sublocation=', '.join(location_parts[:-3]),
        city=location_parts[-3],
        province_state=location_parts[-2],
        country_name=location_parts[-1],
    )


def normalize_iptc_city(value: str | None) -> str | None:
    """
    Возвращает значение города для обратной совместимости.
    """
    return normalize_iptc_location(value).city


def _normalize_iptc_list(values: list[str]) -> list[str]:
    """
    Нормализует список строк для IPTC list-полей.
    """
    normalized_values: list[str] = []
    seen_values: set[str] = set()

    for raw_value in values:
        value = raw_value.strip()
        if not value:
            continue
        marker = value.casefold()
        if marker in seen_values:
            continue
        seen_values.add(marker)
        normalized_values.append(value)

    return normalized_values


def _normalize_iptc_date(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    if re.fullmatch(r'\d{8}', normalized):
        return normalized

    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', normalized):
        return normalized.replace('-', '')

    return None


def _set_iptc_optional_text(
    iptc_info: IPTCInfo,
    field: str,
    value: str | None,
) -> None:
    normalized = (value or '').strip()

    if not normalized:
        return

    try:
        iptc_info[field] = normalized
    except Exception:
        logger.warning(
            'iptc_field_write_skipped',
            field=field,
        )
