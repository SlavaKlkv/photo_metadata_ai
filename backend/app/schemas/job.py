from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class FileStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'


class JobStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'


class ProcessingJobFile(BaseModel):
    file_id: UUID = Field(default_factory=uuid4)
    filename: str
    original_filename: str
    status: FileStatus = FileStatus.QUEUED
    title: str | None = None
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
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


class ProcessingJobFileStatus(BaseModel):
    """
    Краткий статус файла, который возвращает polling endpoint.
    """

    file_id: UUID
    filename: str
    original_filename: str
    status: FileStatus
    error_message: str | None = None


class ProcessingJobStatus(BaseModel):
    """
    Текущее состояние обработки задачи для polling на фронтенде.
    """

    job_id: UUID
    status: JobStatus
    # Оставляем в ответе только данные прогресса вместо полных метаданных.
    files: list[ProcessingJobFileStatus] = Field(default_factory=list)


class ProcessingJobMetadataResult(BaseModel):
    """
    Строка preview-метаданных для таблицы результатов на фронтенде.
    """

    file_id: UUID
    filename: str
    original_filename: str
    status: FileStatus
    title: str | None = None
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    error_message: str | None = None


class ProcessingJobMetadataResults(BaseModel):
    """
    Preview-данные метаданных для всех файлов в задаче.
    """

    job_id: UUID
    status: JobStatus
    # Каждый элемент напрямую соответствует одной строке таблицы результатов.
    results: list[ProcessingJobMetadataResult] = Field(default_factory=list)


class UpdateProcessingJobMetadataRequest(BaseModel):
    """
    Редактируемые поля метаданных, которые отправляет фронтенд.
    """

    title: str | None = None
    description: str | None = None
    keywords: list[str] | None = None


class CleanupJobResult(BaseModel):
    """
    Результат ручной очистки временных файлов задачи.
    """

    job_id: UUID
    deleted_files: int = 0
    deleted_directories: int = 0
class EmbeddedMetadataResult(BaseModel):
    """
    Результат записи метаданных в JPG-файл.
    """

    file_id: UUID
    filename: str
    original_filename: str
    embedded: bool = True
