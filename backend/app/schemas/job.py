from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import (
    AIProvider,
    ExportFormat,
    ExportStatus,
    FileStatus,
    JobStatus,
    StockPlatform,
)
from app.utils.sanitizers import sanitize_keywords, sanitize_metadata_text


class FileProcessingMixin(BaseModel):
    """
    Общие поля состояния файла для response-схем.
    """

    file_id: UUID
    status: FileStatus


class FileNameMixin(BaseModel):
    """
    Общие поля имени файла для response-схем.
    """

    filename: str
    original_filename: str


class MetadataMixin(BaseModel):
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


class JobSettingsMixin(BaseModel):
    """
    Общие поля настроек задачи для request и job-схем.
    """

    shooting_context: str | None = None
    stock_platform: StockPlatform | None = None
    export_formats: list[ExportFormat] = Field(default_factory=list)
    ai_provider: AIProvider | None = None
    export_quality: int | None = Field(
        default=None,
        ge=0,
        le=100,
    )


class ExportStatusMixin(BaseModel):
    """
    Общие поля статуса экспорта для response-схем.
    """

    export_status: ExportStatus | None = None
    export_progress: int = 0
    export_format: ExportFormat | None = None
    export_error_message: str | None = None


class ProcessingJobFile(FileNameMixin, MetadataMixin):
    file_id: UUID = Field(default_factory=uuid4)
    status: FileStatus = FileStatus.QUEUED
    error_message: str | None = None


class CreateProcessingJobFile(BaseModel):
    original_filename: str


class CreateProcessingJobRequest(BaseModel):
    files: list[CreateProcessingJobFile] = Field(default_factory=list)
    shooting_context: str | None = None


class UpdateProcessingJobSettingsRequest(JobSettingsMixin):
    """
    Данные для обновления настроек задачи перед запуском обработки.
    """


class ProcessingJob(JobSettingsMixin, ExportStatusMixin):
    job_id: UUID = Field(default_factory=uuid4)
    status: JobStatus = JobStatus.QUEUED
    files: list[ProcessingJobFile] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ProcessingJobFileStatus(FileProcessingMixin, FileNameMixin):
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


class ProcessingJobExportStatus(ExportStatusMixin):
    """
    Текущий статус экспорта задачи для polling на фронтенде.
    """

    job_id: UUID


class ProcessingJobMetadataResult(
    FileProcessingMixin, FileNameMixin, MetadataMixin
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


class UpdateProcessingJobMetadataRequest(MetadataMixin):
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


class EmbeddedMetadataResult(FileNameMixin):
    """
    Результат записи метаданных в JPG-файл.
    """

    file_id: UUID
    embedded: bool = True
