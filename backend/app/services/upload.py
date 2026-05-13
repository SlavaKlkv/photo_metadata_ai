from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.core.constants import (
    ALLOWED_IMAGE_SUFFIXES,
    ALLOWED_IMAGE_TYPES,
    UPLOAD_DIR,
)


def save_upload_file(file: UploadFile) -> str:
    """
    Сохраняет загруженный файл на сервере и возвращает имя сохраненного файла.
    """
    original_filename = file.filename or 'uploaded_file'
    file_suffix = Path(original_filename).suffix.lower()

    if (
        file.content_type not in ALLOWED_IMAGE_TYPES
        or file_suffix not in ALLOWED_IMAGE_SUFFIXES
    ):
        raise HTTPException(
            status_code=400,
            detail='Only JPG and PNG files are allowed',
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    saved_filename = f'{uuid4()}{file_suffix}'
    saved_file_path = UPLOAD_DIR / saved_filename

    with saved_file_path.open('wb') as output_file:
        while chunk := file.file.read(1024 * 1024):
            output_file.write(chunk)

    return saved_filename
