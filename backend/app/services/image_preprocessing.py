from pathlib import Path
from uuid import UUID

import structlog
from PIL import Image

from app.core.constants import ALLOWED_IMAGE_SUFFIXES
from app.core.runtime import get_runtime_directories, resolve_path_in_base

logger = structlog.get_logger(__name__)


def resize_image_for_ai(
    source_path: Path,
    *,
    job_id: UUID,
    file_id: UUID,
    max_long_side_px: int,
    jpeg_quality: int,
) -> Path:
    """
    Ресайзит изображение по длинной стороне с сохранением aspect ratio.
    Если ресайз не требуется, возвращает исходный путь.
    """
    if max_long_side_px <= 0:
        raise ValueError('resize_long_side_px must be positive')

    if not 1 <= jpeg_quality <= 100:
        raise ValueError('jpeg_quality must be between 1 and 100')

    if source_path.suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise ValueError('Only JPEG files are supported for preprocessing')

    source_size_bytes = source_path.stat().st_size

    with Image.open(source_path) as image:
        raw_width, raw_height = image.size
        width = int(raw_width)
        height = int(raw_height)
        long_side: int = max(width, height)

        if long_side <= max_long_side_px:
            logger.info(
                'image_preprocessing_skipped_for_ai',
                job_id=str(job_id),
                file_id=str(file_id),
                source_path=str(source_path),
                source_size=f'{width}x{height}',
                source_size_bytes=source_size_bytes,
                resize_long_side_px=max_long_side_px,
            )
            return source_path

        scale = max_long_side_px / long_side
        target_size = (
            max(1, round(width * scale)),
            max(1, round(height * scale)),
        )

        resized = image.resize(target_size, Image.Resampling.LANCZOS)
        if resized.mode not in {'RGB', 'L'}:
            resized = resized.convert('RGB')

    runtime_directories = get_runtime_directories()
    job_resize_dir = resolve_path_in_base(
        runtime_directories.temp_resized_dir,
        str(job_id),
    )
    job_resize_dir.mkdir(parents=True, exist_ok=True)

    output_path = resolve_path_in_base(job_resize_dir, f'{file_id}.jpg')
    resized.save(output_path, format='JPEG', quality=jpeg_quality)
    output_size_bytes = output_path.stat().st_size

    logger.info(
        'image_preprocessed_for_ai',
        job_id=str(job_id),
        file_id=str(file_id),
        source_path=str(source_path),
        output_path=str(output_path),
        source_size=f'{width}x{height}',
        output_size=f'{target_size[0]}x{target_size[1]}',
        source_size_bytes=source_size_bytes,
        output_size_bytes=output_size_bytes,
        resize_long_side_px=max_long_side_px,
        jpeg_quality=jpeg_quality,
    )

    return output_path
