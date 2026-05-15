from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.sanitizers import sanitize_keywords, sanitize_metadata_text


class FileStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class JobStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class FileProcessingFields(BaseModel):
    """
    Общие поля состояния файла для response-схем.
    """

    file_id: UUID
    status: FileStatus


class FileNameFields(BaseModel):
    """
    Общие поля имени файла для response-схем.
    """

    filename: str
    original_filename: str


class MetadataFields(BaseModel):
    """
    Общие metadata-поля с sanitization для response и update-схем.
    """

    model_config = ConfigDict(validate_assignment=True)

    title: str | None = None
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)

    @field_validator('title', 'description')
    @classmethod
    def sanitize_metadata_text(cls, value: str | None) -> str | None:
        """
        Валидирует и очищает текстовые metadata-поля.
        """
        return sanitize_metadata_text(value)

    @field_validator('keywords')
    @classmethod
    def sanitize_keywords(cls, value: list[str] | None) -> list[str]:
        """
        Валидирует keywords перед сохранением.
        """
        return sanitize_keywords(value)



class ProcessingJobFile(FileNameFields, MetadataFields):
    file_id: UUID = Field(default_factory=uuid4)
    status: FileStatus = FileStatus.QUEUED
    error_message: str | None = None


class CreateProcessingJobFile(BaseModel):
    original_filename: str


class CreateProcessingJobRequest(BaseModel):
    files: list[CreateProcessingJobFile] = Field(default_factory=list)


class ProcessingJob(BaseModel):
    job_id: UUID = Field(default_factory=uuid4)
    status: JobStatus = JobStatus.QUEUED
    files: list[ProcessingJobFile] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ProcessingJobFileStatus(FileProcessingFields, FileNameFields):
    """
    Краткий статус файла, который возвращает polling endpoint.
    """

    error_message: str | None = None


class ProcessingJobStatus(BaseModel):
    """
    Текущее состояние обработки задачи для polling на фронтенде.
    """

    job_id: UUID
    status: JobStatus
    # Оставляем в ответе только данные прогресса вместо полных метаданных.
    files: list[ProcessingJobFileStatus] = Field(default_factory=list)


class ProcessingJobMetadataResult(
    FileProcessingFields,
    FileNameFields,
    MetadataFields,
):
    """
    Строка preview-метаданных для таблицы результатов на фронтенде.
    """

    error_message: str | None = None


class ProcessingJobMetadataResults(BaseModel):
    """
    Preview-данные метаданных для всех файлов в задаче.
    """

    job_id: UUID
    status: JobStatus
    # Каждый элемент напрямую соответствует одной строке таблицы результатов.
    results: list[ProcessingJobMetadataResult] = Field(default_factory=list)


class UpdateProcessingJobMetadataRequest(MetadataFields):
    """
    Редактируемые поля метаданных, которые отправляет фронтенд.
    """

    keywords: list[str] | None = None


class CleanupJobResult(BaseModel):
    """
    Результат ручной очистки временных файлов задачи.
    """

    job_id: UUID
    deleted_files: int = 0
    deleted_directories: int = 0


class EmbeddedMetadataResult(FileNameFields):
    """
    Результат записи метаданных в JPG-файл.
    """

    file_id: UUID
    embedded: bool = True
