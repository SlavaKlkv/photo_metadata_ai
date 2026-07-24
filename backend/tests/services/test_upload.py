from io import BytesIO

import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import Headers
from structlog.testing import capture_logs

from app.core.config import settings
from app.core.exceptions import UploadValidationError
from app.core.runtime import get_runtime_directories
from app.services.upload import (
    save_upload_file,
    validate_upload_file,
    verify_image,
)


def _jpeg_bytes(size: tuple[int, int] = (4, 4)) -> bytes:
    buffer = BytesIO()
    Image.new('RGB', size).save(buffer, format='JPEG')
    return buffer.getvalue()


def _png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new('RGB', (4, 4)).save(buffer, format='PNG')
    return buffer.getvalue()


def _mpo_bytes(size: tuple[int, int] = (4, 4)) -> bytes:
    """
    Собирает валидный MPO-контейнер (два кадра), как пишут камеры
    Panasonic/Fujifilm. Pillow распознаёт такой файл как format='MPO'.
    """
    buffer = BytesIO()
    first_frame = Image.new('RGB', size, 'red')
    second_frame = Image.new('RGB', size, 'blue')
    first_frame.save(buffer, format='MPO', append_images=[second_frame])
    return buffer.getvalue()


def _upload_file(
    filename: str = 'photo.jpg',
    content_type: str = 'image/jpeg',
    content: bytes = b'',
) -> UploadFile:
    return UploadFile(
        file=BytesIO(content),
        filename=filename,
        headers=Headers({'content-type': content_type}),
    )


def test_verify_image_accepts_valid_jpeg():
    verify_image(_jpeg_bytes())


def test_verify_image_rejects_non_jpeg_image():
    with pytest.raises(UploadValidationError):
        verify_image(_png_bytes())


def test_verify_image_accepts_mpo():
    verify_image(_mpo_bytes())


@pytest.mark.asyncio
async def test_validate_upload_file_rejects_wrong_content_type():
    content = _jpeg_bytes()
    file = _upload_file(content_type='image/png', content=content)

    with pytest.raises(UploadValidationError, match='content type'):
        await validate_upload_file(file, content)


@pytest.mark.asyncio
async def test_validate_upload_file_rejects_wrong_suffix():
    content = _jpeg_bytes()
    file = _upload_file(filename='photo.png', content=content)

    with pytest.raises(UploadValidationError, match='extension'):
        await validate_upload_file(file, content)


@pytest.mark.asyncio
async def test_validate_upload_file_rejects_oversized_file(monkeypatch):
    monkeypatch.setattr(settings, 'MAX_UPLOAD_FILE_SIZE_MB', 0)
    content = _jpeg_bytes()
    file = _upload_file(content=content)

    with pytest.raises(UploadValidationError, match='size exceeds'):
        await validate_upload_file(file, content)


@pytest.mark.asyncio
async def test_validate_upload_file_rejects_corrupted_content():
    content = b'not an image at all'
    file = _upload_file(content=content)

    with pytest.raises(UploadValidationError, match='corrupted'):
        await validate_upload_file(file, content)


@pytest.mark.asyncio
async def test_validate_upload_file_rejects_disguised_png():
    content = _png_bytes()
    file = _upload_file(content=content)

    with capture_logs() as logs:
        with pytest.raises(
            UploadValidationError,
            match='Unsupported image format',
        ):
            await validate_upload_file(file, content)

    failure_events = [
        entry
        for entry in logs
        if entry.get('event') == 'upload_validation_failed'
    ]
    assert failure_events, 'ожидалось логирование причины отказа'
    assert failure_events[-1]['reason'] == 'unsupported_image_format'
    assert failure_events[-1]['image_format'] == 'PNG'


@pytest.mark.asyncio
async def test_validate_upload_file_accepts_valid_jpeg():
    content = _jpeg_bytes()
    file = _upload_file(content=content)

    await validate_upload_file(file, content)


@pytest.mark.asyncio
async def test_validate_upload_file_accepts_mpo():
    content = _mpo_bytes()
    file = _upload_file(content=content)

    await validate_upload_file(file, content)


@pytest.mark.asyncio
async def test_save_upload_file_accepts_mpo():
    content = _mpo_bytes()
    file = _upload_file(filename='panasonic.jpg', content=content)

    saved_filename = await save_upload_file(file)

    saved_path = get_runtime_directories().uploads_dir / saved_filename
    assert saved_path.is_file()
    assert saved_path.read_bytes() == content


@pytest.mark.asyncio
async def test_save_upload_file_writes_sanitized_unique_name():
    content = _jpeg_bytes()
    file = _upload_file(filename='My Photo 01.JPG', content=content)

    saved_filename = await save_upload_file(file)

    assert saved_filename.endswith('_my_photo_01.jpg')

    saved_path = get_runtime_directories().uploads_dir / saved_filename
    assert saved_path.is_file()
    assert saved_path.read_bytes() == content


@pytest.mark.asyncio
async def test_save_upload_file_rejects_invalid_upload():
    content = _png_bytes()
    file = _upload_file(filename='photo.png', content=content)

    with pytest.raises(UploadValidationError):
        await save_upload_file(file)

    uploads_dir = get_runtime_directories().uploads_dir
    assert list(uploads_dir.iterdir()) == []
