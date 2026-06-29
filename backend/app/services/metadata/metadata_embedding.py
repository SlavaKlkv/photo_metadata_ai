import re
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
class IPTCEmbeddingPayload:
    object_name: str
    caption_abstract: str
    keywords: list[str]
    supplemental_category: list[str]
    city: str | None = None
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
            'city',
            payload.city,
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


def _build_default_iptc_payload(
    file: ProcessingJobFile,
) -> IPTCEmbeddingPayload:
    return IPTCEmbeddingPayload(
        object_name=file.title or '',
        caption_abstract=file.description or '',
        keywords=list(file.keywords),
        supplemental_category=list(file.categories),
        city=normalize_iptc_city(file.location_metadata),
        date_created=file.editorial_date if file.is_editorial else None,
    )


def normalize_iptc_city(value: str | None) -> str | None:
    """
    Возвращает только значение города для IPTC City.
    """
    if value is None:
        return None

    normalized = ' '.join(value.strip().split())
    if not normalized:
        return None

    normalized_lower = normalized.lower()
    for prefix in ('city=', 'location='):
        if normalized_lower.startswith(prefix):
            normalized = normalized[len(prefix) :].strip()
            break

    city = re.split(r'\s*[,;|/]\s*', normalized, maxsplit=1)[0].strip()

    return city or None


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
