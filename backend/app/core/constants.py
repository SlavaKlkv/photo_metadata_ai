from pathlib import Path

UPLOAD_DIR = Path('uploads')
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
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png'}
ALLOWED_IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
