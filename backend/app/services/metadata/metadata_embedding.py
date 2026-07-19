import re
import struct
from dataclasses import dataclass
from pathlib import Path

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
