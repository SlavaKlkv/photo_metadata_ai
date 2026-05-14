from pathlib import Path

# Директории для хранения файлов.
UPLOAD_DIR = Path('uploads')

# Временные директории для обработки файлов.
TEMP_DIR = Path('temp')
TEMP_PREVIEW_DIR = TEMP_DIR / 'previews'
TEMP_EXPORT_DIR = TEMP_DIR / 'exports'
TEMP_ZIP_DIR = TEMP_DIR / 'zips'
TEMP_RESIZED_DIR = TEMP_DIR / 'resized'
JOB_TEMP_DIRS = [
    TEMP_PREVIEW_DIR,
    TEMP_EXPORT_DIR,
    TEMP_ZIP_DIR,
    TEMP_RESIZED_DIR,
]

# Ограничения и поддерживаемые форматы изображений.
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png'}
JPG_IMAGE_SUFFIXES = {'.jpg', '.jpeg'}
PNG_IMAGE_SUFFIXES = {'.png'}
ALLOWED_IMAGE_SUFFIXES = JPG_IMAGE_SUFFIXES | PNG_IMAGE_SUFFIXES
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

# Ограничения AI processing pipeline.
MAX_CONCURRENT_AI_REQUESTS = 3
