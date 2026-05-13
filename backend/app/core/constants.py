from pathlib import Path

UPLOAD_DIR = Path('uploads')
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png'}
ALLOWED_IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
