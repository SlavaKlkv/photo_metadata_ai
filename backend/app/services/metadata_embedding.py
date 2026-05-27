from pathlib import Path

import piexif
import piexif.helper
import structlog
from fastapi import HTTPException

from app.core.constants import JPG_IMAGE_SUFFIXES, UPLOAD_DIR
from app.core.runtime import resolve_path_in_base
from app.schemas.job import ProcessingJobFile

logger = structlog.get_logger(__name__)


def embed_metadata_into_jpg(file: ProcessingJobFile) -> None:
    """
    Записывает title, description и keywords в EXIF-поля JPG-файла.
    """
    logger.info(
        'metadata_embedding_started',
        file_id=str(file.file_id),
        filename=file.filename,
    )
    file_path = get_upload_file_path(file.filename)

    _validate_jpg_file_path(file_path)

    try:
        exif_dict = piexif.load(str(file_path))
        exif_dict['0th'][piexif.ImageIFD.XPTitle] = _encode_windows_text(
            file.title or ''
        )
        exif_dict['0th'][piexif.ImageIFD.XPKeywords] = _encode_windows_text(
            ', '.join(file.keywords)
        )
        exif_dict['0th'][piexif.ImageIFD.XPComment] = _encode_windows_text(
            file.description or ''
        )
        exif_dict['Exif'][piexif.ExifIFD.UserComment] = (
            piexif.helper.UserComment.dump(
                file.description or '',
                encoding='unicode',
            )
        )

        description = file.description or file.title or ''
        if description:
            exif_dict['0th'][piexif.ImageIFD.ImageDescription] = (
                _encode_ascii_text(description)
            )
        piexif.insert(piexif.dump(exif_dict), str(file_path))

        logger.info(
            'metadata_embedding_completed',
            file_id=str(file.file_id),
            filename=file.filename,
            keywords_count=len(file.keywords),
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
    try:
        file_path = resolve_path_in_base(UPLOAD_DIR, Path(filename).name)
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

    if file_path.suffix.lower() not in JPG_IMAGE_SUFFIXES:
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


def _encode_windows_text(value: str) -> bytes:
    """
    Кодирует строку для EXIF XP* полей.
    """

    return f'{value}\0'.encode('utf-16le')


def _encode_ascii_text(value: str) -> bytes:
    """
    Кодирует строку для ASCII EXIF-поля без ошибки на Unicode.
    """

    return value.encode('ascii', errors='replace')
