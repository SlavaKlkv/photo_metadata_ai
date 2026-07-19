from uuid import UUID

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
    StockPlatform,
)
from app.schemas.export import ExportArtifact
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
    location_sublocation: str | None = None
    location_city: str | None = None
    location_province_state: str | None = None
    location_country: str | None = None
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
        'location_sublocation',
        'location_city',
        'location_province_state',
        'location_country',
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


class ExportStatusMixin(BaseModel):
    """
    Общие поля статуса экспорта для response-схем.
    """

    export_status: ExportStatus | None = None
    export_progress: int = 0
    export_format: ExportFormat | None = None
    export_error_message: str | None = None
    export_artifacts: list[ExportArtifact] = Field(default_factory=list)
