from app.core.runtime import get_runtime_directories

runtime_directories = get_runtime_directories()

# Директории для хранения файлов.
JOBS_DIR = runtime_directories.jobs_dir
RESULTS_DIR = runtime_directories.results_dir
UPLOAD_DIR = runtime_directories.uploads_dir

# Временные директории для обработки файлов.
TEMP_DIR = runtime_directories.temp_dir
TEMP_PREVIEW_DIR = runtime_directories.temp_preview_dir
TEMP_EXPORT_DIR = runtime_directories.temp_export_dir
TEMP_ZIP_DIR = runtime_directories.temp_zip_dir
TEMP_RESIZED_DIR = runtime_directories.temp_resized_dir
JOB_TEMP_DIRS = [
    TEMP_PREVIEW_DIR,
    TEMP_EXPORT_DIR,
    TEMP_ZIP_DIR,
    TEMP_RESIZED_DIR,
]

# Ограничения и поддерживаемые форматы изображений.
ALLOWED_IMAGE_TYPES = {'image/jpeg'}
ALLOWED_IMAGE_SUFFIXES = {'.jpg', '.jpeg'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
DEFAULT_AI_RESIZE_LONG_SIDE_PX = 1800

# Ограничения AI processing pipeline.
MAX_CONCURRENT_AI_REQUESTS = 3
AI_PROVIDER_TIMEOUT = 120
