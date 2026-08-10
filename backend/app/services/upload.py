from io import BytesIO
from pathlib import Path
from uuid import uuid4

import aiofiles
import structlog
from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.constants import (
    ALLOWED_IMAGE_FORMATS,
    ALLOWED_IMAGE_SUFFIXES,
    ALLOWED_IMAGE_TYPES,
)
from app.core.exceptions import (
    UnsupportedImageFormatError,
    UploadValidationError,
)
from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.utils.sanitizers import sanitize_filename

logger = structlog.get_logger(__name__)


def verify_image(content: bytes) -> None:
    """
    Проверяет, что файл является валидным изображением поддерживаемого
    формата (JPEG или JPEG-совместимый MPO).
    """
    with Image.open(BytesIO(content)) as image:
        image_format = (image.format or '').upper()
        image.verify()

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise UnsupportedImageFormatError(image_format or 'unknown')


async def validate_upload_file(file: UploadFile, content: bytes) -> None:
    """
    Выполняет валидацию загружаемого файла.
    """
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        logger.warning(
            'upload_validation_failed',
            filename=file.filename,
            content_type=file.content_type,
            reason='invalid_content_type',
        )
        raise UploadValidationError(
            'Only JPEG files are allowed '
            f'(received content type: {file.content_type})',
        )

    suffix = Path(file.filename or '').suffix.lower()

    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        logger.warning(
            'upload_validation_failed',
            filename=file.filename,
            suffix=suffix,
            reason='invalid_file_suffix',
        )
        raise UploadValidationError(
            'Only JPEG files are allowed '
            f'(received extension: {suffix or "none"})',
        )

    max_file_size_bytes = settings.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024

    if len(content) > max_file_size_bytes:
        logger.warning(
            'upload_validation_failed',
            filename=file.filename,
            file_size=len(content),
            max_file_size=max_file_size_bytes,
            reason='file_too_large',
        )
        raise UploadValidationError(
            'File size exceeds '
            f'{settings.MAX_UPLOAD_FILE_SIZE_MB} MB ({len(content)} bytes)',
        )

    try:
        await run_in_threadpool(verify_image, content)
    except UnsupportedImageFormatError as error:
        logger.warning(
            'upload_validation_failed',
            filename=file.filename,
            image_format=error.image_format,
            reason='unsupported_image_format',
        )
        raise
    except UploadValidationError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError):
        logger.warning(
            'upload_validation_failed',
            filename=file.filename,
            reason='invalid_or_corrupted_image',
        )
        raise UploadValidationError(
            'Invalid or corrupted JPEG image',
        )


async def save_upload_file(file: UploadFile) -> str:
    """
    Сохраняет загруженный файл на сервере и возвращает имя сохраненного файла.
    """
    original_filename = file.filename or 'uploaded_file'
    suffix = Path(original_filename).suffix.lower()
    safe_filename_stem = sanitize_filename(original_filename)

    content = await file.read()
    logger.info(
        'file_upload_started',
        filename=original_filename,
        file_size=len(content),
    )

    await validate_upload_file(file, content)

    runtime_directories = ensure_runtime_directories()
    upload_dir = runtime_directories.uploads_dir

    saved_filename = f'{uuid4()}_{safe_filename_stem}{suffix}'
    try:
        saved_file_path = resolve_path_in_base(upload_dir, saved_filename)
    except ValueError as error:
        logger.warning(
            'upload_validation_failed',
            filename=original_filename,
            reason='unsafe_file_path',
            error=str(error),
        )
        raise UploadValidationError(
            'Unsafe file path',
        ) from error

    async with aiofiles.open(saved_file_path, 'wb') as output_file:
        await output_file.write(content)
    logger.info(
        'file_upload_completed',
        filename=original_filename,
        saved_filename=saved_filename,
        saved_file_path=str(saved_file_path),
    )

    return saved_filename
