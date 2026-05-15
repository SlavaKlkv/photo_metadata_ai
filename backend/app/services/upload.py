import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.core.constants import (
    ALLOWED_IMAGE_SUFFIXES,
    ALLOWED_IMAGE_TYPES,
    MAX_FILE_SIZE_BYTES,
    UPLOAD_DIR,
)
from app.utils.sanitizers import sanitize_filename


def verify_image(content: bytes) -> None:
    """
    Проверяет, что файл является валидным изображением.
    """
    Image.open(BytesIO(content)).verify()


async def validate_upload_file(file: UploadFile, content: bytes) -> None:
    """
    Выполняет валидацию загружаемого файла.
    """
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail='Only JPG and PNG files are allowed',
        )

    suffix = Path(file.filename or '').suffix.lower()

    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail='Only JPG and PNG files are allowed',
        )

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail='File size exceeds 10 MB',
        )

    try:
        await run_in_threadpool(verify_image, content)
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise HTTPException(
            status_code=400,
            detail='Invalid or corrupted image file',
        )


async def save_upload_file(file: UploadFile) -> str:
    """
    Сохраняет загруженный файл на сервере и возвращает имя сохраненного файла.
    """
    original_filename = file.filename or 'uploaded_file'
    suffix = Path(original_filename).suffix.lower()
    safe_filename_stem = sanitize_filename(original_filename)

    content = await file.read()

    await validate_upload_file(file, content)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    saved_filename = f'{uuid4()}_{safe_filename_stem}{suffix}'
    saved_file_path = UPLOAD_DIR / saved_filename

    async with aiofiles.open(saved_file_path, 'wb') as output_file:
        await output_file.write(content)

    return saved_filename
