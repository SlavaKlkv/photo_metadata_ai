from pathlib import Path

import piexif
import piexif.helper
from fastapi import HTTPException

from app.core.constants import JPG_IMAGE_SUFFIXES, UPLOAD_DIR
from app.schemas.job import ProcessingJobFile


def embed_metadata_into_jpg(file: ProcessingJobFile) -> None:
    """
    Записывает title, description и keywords в EXIF-поля JPG-файла.
    """

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
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail='Failed to embed metadata into JPG',
        ) from error


def get_upload_file_path(filename: str) -> Path:
    """
    Формирует путь к файлу внутри директории uploads.
    """

    return UPLOAD_DIR / Path(filename).name


def _validate_jpg_file_path(file_path: Path) -> None:
    """
    Проверяет, что файл существует и является JPG/JPEG.
    """

    if file_path.suffix.lower() not in JPG_IMAGE_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail='Metadata embedding is supported only for JPG files',
        )

    if not file_path.exists():
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
