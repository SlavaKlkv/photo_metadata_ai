from pathlib import Path

UPLOAD_DIR = Path('uploads')
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png'}
JPG_IMAGE_SUFFIXES = {'.jpg', '.jpeg'}
PNG_IMAGE_SUFFIXES = {'.png'}
ALLOWED_IMAGE_SUFFIXES = JPG_IMAGE_SUFFIXES | PNG_IMAGE_SUFFIXES
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
