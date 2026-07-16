from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

from app.core.runtime import get_runtime_directories
from app.services.image_preprocessing import resize_image_for_ai


def _create_image(
    path: Path,
    size: tuple[int, int],
    mode: str = 'RGB',
    image_format: str = 'JPEG',
) -> Path:
    image = Image.new(mode, size)
    image.save(path, format=image_format)
    return path


def test_resize_rejects_non_positive_long_side(tmp_path):
    source = _create_image(tmp_path / 'img.jpg', (10, 10))

    with pytest.raises(ValueError, match='resize_long_side_px'):
        resize_image_for_ai(
            source,
            job_id=uuid4(),
            file_id=uuid4(),
            max_long_side_px=0,
            jpeg_quality=80,
        )


@pytest.mark.parametrize('quality', [0, 101])
def test_resize_rejects_invalid_jpeg_quality(tmp_path, quality):
    source = _create_image(tmp_path / 'img.jpg', (10, 10))

    with pytest.raises(ValueError, match='jpeg_quality'):
        resize_image_for_ai(
            source,
            job_id=uuid4(),
            file_id=uuid4(),
            max_long_side_px=100,
            jpeg_quality=quality,
        )


def test_resize_rejects_unsupported_suffix(tmp_path):
    source = _create_image(tmp_path / 'img.png', (10, 10), image_format='PNG')

    with pytest.raises(ValueError, match='JPEG'):
        resize_image_for_ai(
            source,
            job_id=uuid4(),
            file_id=uuid4(),
            max_long_side_px=100,
            jpeg_quality=80,
        )


def test_resize_skips_small_image_and_returns_source_path(tmp_path):
    source = _create_image(tmp_path / 'small.jpg', (100, 50))

    result = resize_image_for_ai(
        source,
        job_id=uuid4(),
        file_id=uuid4(),
        max_long_side_px=200,
        jpeg_quality=80,
    )

    assert result == source


def test_resize_downscales_large_image_preserving_aspect_ratio():
    directories = get_runtime_directories()
    job_id = uuid4()
    file_id = uuid4()
    source = _create_image(directories.uploads_dir / 'large.jpg', (400, 200))

    result = resize_image_for_ai(
        source,
        job_id=job_id,
        file_id=file_id,
        max_long_side_px=200,
        jpeg_quality=80,
    )

    expected_path = (
        directories.temp_resized_dir / str(job_id) / f'{file_id}.jpg'
    )
    assert result == expected_path

    with Image.open(result) as resized:
        assert resized.size == (200, 100)
        assert resized.format == 'JPEG'


def test_resize_rounds_target_size(tmp_path):
    directories = get_runtime_directories()
    source = _create_image(directories.uploads_dir / 'odd.jpg', (300, 199))

    result = resize_image_for_ai(
        source,
        job_id=uuid4(),
        file_id=uuid4(),
        max_long_side_px=200,
        jpeg_quality=80,
    )

    with Image.open(result) as resized:
        assert resized.size == (200, 133)


def test_resize_converts_non_rgb_modes_to_rgb():
    directories = get_runtime_directories()
    # PNG в палитровом режиме, сохранённый с суффиксом .jpg,
    # проходит проверку суффикса, но требует конвертации в RGB.
    source = _create_image(
        directories.uploads_dir / 'palette.jpg',
        (400, 400),
        mode='P',
        image_format='PNG',
    )

    result = resize_image_for_ai(
        source,
        job_id=uuid4(),
        file_id=uuid4(),
        max_long_side_px=100,
        jpeg_quality=80,
    )

    with Image.open(result) as resized:
        assert resized.mode == 'RGB'
        assert resized.format == 'JPEG'
