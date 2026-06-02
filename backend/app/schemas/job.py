from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from app.core.enums import (
    AIProvider,
    ExportFormat,
    ExportStatus,
    FileStatus,
    JobStatus,
    MetadataFieldSource,
    StockPlatform,
    StockPlatformType,
)
from app.utils.sanitizers import (
    sanitize_keywords,
    sanitize_metadata_text,
    sanitize_string_list,
)


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


class StockSpecificMetadataMixin(BaseModel):
    """
    Дополнительные metadata-поля для stock-специфичных требований.
    """

    categories: list[str] = Field(default_factory=list)
    category_2: str | None = None
    license_type: str | None = None
    location_metadata: str | None = None
    editorial_date: str | None = None
    is_editorial: bool = False
    editorial_caption: str | None = None
    has_people: bool | None = None
    people_count: int | None = Field(default=None, ge=0)
    model_release_available: bool | None = None
    releases: list[str] = Field(default_factory=list)
    ai_generated_content_disclosure: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            'ai_generated_content_disclosure',
            'created using generative AI tools',
        ),
        serialization_alias='created using generative AI tools',
    )
    is_illustration: bool | None = None
    mature_content: bool | None = None
    iptc_embedded_metadata: bool = False

    @field_validator(
        'category_2',
        'license_type',
        'location_metadata',
        'editorial_date',
        'editorial_caption',
    )
    @classmethod
    def sanitize_stock_metadata_text(
        cls,
        value: str | None,
    ) -> str | None:
        """
        Валидирует и очищает дополнительные текстовые metadata-поля.
        """
        return sanitize_metadata_text(value)

    @field_validator('categories', 'releases')
    @classmethod
    def sanitize_string_list_values(
        cls,
        value: list[str] | None,
    ) -> list[str]:
        """
        Валидирует списковые дополнительные metadata-поля.
        """
        return sanitize_string_list(value)


class PromptMetadataMixin(BaseModel):
    """
    Сведения о prompt template, который использовался при генерации.
    """

    prompt_version: str | None = None
    prompt_language: str | None = None


class JobSettingsMixin(BaseModel):
    """
    Общие поля настроек задачи для request и job-схем.
    """

    shooting_context: str | None = None
    stock_platform: StockPlatform | None = None
    export_formats: list[ExportFormat] = Field(default_factory=list)
    ai_provider: AIProvider | None = None
    effective_ai_provider: AIProvider | None = None
    effective_ai_model: str | None = None


class ExportArtifact(BaseModel):
    """
    Описание одного экспортного артефакта.
    """

    export_format: ExportFormat
    path: str
    filename: str
    size_bytes: int
    count: int = 1


class ExportStatusMixin(BaseModel):
    """
    Общие поля статуса экспорта для response-схем.
    """

    export_status: ExportStatus | None = None
    export_progress: int = 0
    export_format: ExportFormat | None = None
    export_error_message: str | None = None
    export_artifacts: list[ExportArtifact] = Field(default_factory=list)


class CreateProcessingJobFile(BaseModel):
    original_filename: str


class CreateProcessingJobRequest(BaseModel):
    files: list[CreateProcessingJobFile] = Field(default_factory=list)
    shooting_context: str | None = None


class UpdateProcessingJobSettingsRequest(JobSettingsMixin):
    """
    Данные для обновления настроек задачи перед запуском обработки.
    """


class MetadataSnapshot(MetadataMixin, StockSpecificMetadataMixin):
    """
    Снимок metadata для истории regenerate attempts.
    """


class RegenerateAttempt(BaseModel):
    """
    История одной попытки regenerate metadata.
    """

    attempt_id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    shooting_context: str | None = None
    stock_platform: StockPlatform
    ai_provider: AIProvider
    previous_metadata: MetadataSnapshot
    regenerated_metadata: MetadataSnapshot


class ProcessingJobFile(
    FileNameMixin,
    MetadataMixin,
    StockSpecificMetadataMixin,
    PromptMetadataMixin,
):
    file_id: UUID = Field(default_factory=uuid4)
    status: FileStatus = FileStatus.QUEUED
    error_message: str | None = None
    regenerate_attempts: list[RegenerateAttempt] = Field(default_factory=list)
    selected_for_export: bool = True
    field_sources: dict[str, MetadataFieldSource] = Field(default_factory=dict)


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


class MetadataValidationIssue(BaseModel):
    """
    Нормализованная ошибка/предупреждение валидации metadata-поля.
    """

    field: str
    code: str
    message: str


class MetadataValidationResult(BaseModel):
    """
    Результат валидации metadata с разделением на ошибки и предупреждения.
    """

    errors: list[MetadataValidationIssue] = Field(default_factory=list)
    warnings: list[MetadataValidationIssue] = Field(default_factory=list)


MetadataPreviewValue = str | bool | int | float | list[str] | None


class StockPreviewField(BaseModel):
    """
    Одно поле stock-aware preview.
    """

    key: str
    label: str
    value: MetadataPreviewValue


class StockSpecificPreviewBlock(BaseModel):
    """
    Platform-specific блок preview-полей.
    """

    title: str
    fields: list[StockPreviewField] = Field(default_factory=list)


class StockAwareMetadataPreview(BaseModel):
    """
    Preview в формате выбранной платформы.
    """

    stock_platform: StockPlatform
    common_fields: list[StockPreviewField] = Field(default_factory=list)
    stock_specific: StockSpecificPreviewBlock
    errors: list[MetadataValidationIssue] = Field(default_factory=list)
    warnings: list[MetadataValidationIssue] = Field(default_factory=list)


class ProcessingJobMetadataResult(
    FileProcessingMixin,
    FileNameMixin,
    MetadataMixin,
    StockSpecificMetadataMixin,
    PromptMetadataMixin,
):
    """
    Строка preview-метаданных для таблицы результатов на фронтенде.
    """

    error_message: str | None = None
    selected_for_export: bool = True
    field_sources: dict[str, MetadataFieldSource] = Field(default_factory=dict)
    edited_fields: list[str] = Field(default_factory=list)
    preview: StockAwareMetadataPreview | None = None
    validation: MetadataValidationResult = Field(
        default_factory=MetadataValidationResult
    )


class PaginationMetadata(BaseModel):
    """
    Метаданные пагинации списка результатов.
    """

    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: bool
    has_prev: bool


class ProcessingJobMetadataResults(BaseModel):
    """
    Preview-данные метаданных для всех файлов в задаче.
    """

    job_id: UUID
    status: JobStatus
    # Каждый элемент напрямую соответствует одной строке таблицы результатов.
    results: list[ProcessingJobMetadataResult] = Field(default_factory=list)
    pagination: PaginationMetadata | None = None


class UpdateJobFileSelectionRequest(BaseModel):
    """
    Массовое изменение выбора файлов для export по всей задаче.
    """

    selected_for_export: bool


class UpdateJobFileSelectionResponse(BaseModel):
    """
    Результат массового изменения выбора файлов.
    """

    job_id: UUID
    selected_for_export: bool
    updated_count: int
    total_items: int


class UpdateProcessingJobMetadataRequest(MetadataMixin):
    """
    Редактируемые поля метаданных, которые отправляет фронтенд.
    """

    keywords: list[str] | None = None
    selected_for_export: bool | None = None
    categories: list[str] | None = None
    releases: list[str] | None = None
    category_2: str | None = None
    license_type: str | None = None
    location_metadata: str | None = None
    editorial_date: str | None = None
    is_editorial: bool | None = None
    editorial_caption: str | None = None
    has_people: bool | None = None
    people_count: int | None = Field(default=None, ge=0)
    model_release_available: bool | None = None
    ai_generated_content_disclosure: bool | None = Field(
        default=None,
        validation_alias=AliasChoices(
            'ai_generated_content_disclosure',
            'created using generative AI tools',
        ),
        serialization_alias='created using generative AI tools',
    )
    is_illustration: bool | None = None
    mature_content: bool | None = None
    iptc_embedded_metadata: bool | None = None

    @field_validator('categories', 'releases')
    @classmethod
    def sanitize_optional_string_list_values(
        cls,
        value: list[str] | None,
    ) -> list[str] | None:
        """
        Валидирует необязательные списковые поля PATCH-запроса.
        """
        if value is None:
            return None

        return sanitize_string_list(value)

    @field_validator(
        'category_2',
        'license_type',
        'location_metadata',
        'editorial_date',
        'editorial_caption',
    )
    @classmethod
    def sanitize_optional_stock_metadata_text(
        cls,
        value: str | None,
    ) -> str | None:
        """
        Валидирует необязательные текстовые stock-поля PATCH-запроса.
        """
        return sanitize_metadata_text(value)


class RegenerateFileMetadataRequest(BaseModel):
    """
    Параметры regenerate metadata для одного файла.
    """

    shooting_context: str | None = None
    stock_platform: StockPlatform | None = None
    ai_provider: AIProvider | None = None


class RegenerateFileMetadataResponse(BaseModel):
    """
    Ответ endpoint regenerate metadata per file.
    """

    job_id: UUID
    file_id: UUID
    attempt_id: UUID
    metadata: ProcessingJobMetadataResult
    previous_metadata: MetadataSnapshot


class StockFieldOptions(BaseModel):
    """
    Списки допустимых значений полей для выбранной stock-платформы.
    """

    stock_platform: StockPlatform
    platform_type: StockPlatformType
    categories: list[str] = Field(default_factory=list)
    license_types: list[str] = Field(default_factory=list)
    title_required: bool = True
    title_min_words: int = 1
    title_recommended_min_words: int | None = None
    title_recommended_max_words: int | None = None
    title_max_characters: int = 0
    title_warning_characters: int | None = None
    description_required: bool = False
    description_max_characters: int = 0
    image_min_megapixels: float | None = None
    image_max_megapixels: float | None = None
    keywords_required: bool = True
    keywords_min_count: int = 0
    keywords_recommended_min: int = 0
    keywords_recommended_max: int = 0
    keywords_max_count: int = 0
    keywords_order_priority: bool = False
    keywords_duplicates_allowed: bool = True
    top_keywords_weighted: bool = False
    categories_required: bool = False
    multi_category_supported: bool = False
    max_categories: int = 1
    location_supported: bool = False
    location_recommended: bool = False
    iptc_embedded_metadata: bool = False
    release_forms_required: bool = False
    editorial_caption_required_for_editorial: bool = False
    validation_english_required: bool = False
    validation_keyword_spam_forbidden: bool = False
    validation_irrelevant_keywords_forbidden: bool = False
    validation_duplicate_keywords_forbidden: bool = False
    validation_restricted_terms_forbidden: bool = False
    validation_accurate_caption_required: bool = False
    supports_category_2: bool = False
    license_required: bool = False
    releases_required: bool = False
    editorial_caption_required: bool = False
    editorial_date_required: bool = False
    editorial_location_required: bool = False
    people_supported: bool = True
    model_release_required_when_people: bool = False


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
    iptc_embedded_metadata: bool = True
