from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

from app.core.enums import (
    FileStatus,
    StockPlatform,
    StockPlatformType,
)
from app.schemas.job import (
    MetadataValidationIssue,
    MetadataValidationResult,
    ProcessingJobFile,
    StockAwareMetadataPreview,
    StockFieldOptions,
    StockPreviewField,
    StockSpecificPreviewBlock,
)
from app.services.metadata.metadata_embedding import (
    IPTCEmbeddingPayload,
    get_upload_file_path,
)
from app.services.metadata.stock_validation_lists import (
    find_restricted_terms_in_text,
)


@dataclass(frozen=True)
class StockRules:
    platform_type: StockPlatformType
    title_required: bool
    title_max_characters: int
    title_warning_characters: int | None
    title_min_words: int
    title_recommended_min_words: int | None
    title_recommended_max_words: int | None
    description_required: bool
    description_max_characters: int
    image_min_megapixels: float | None
    image_max_megapixels: float | None
    keywords_required: bool
    keywords_min_count: int
    keywords_recommended_min: int
    keywords_recommended_max: int
    keywords_max_count: int
    keywords_order_priority: bool
    keywords_duplicates_allowed: bool
    top_keywords_weighted: bool
    categories_required: bool
    max_categories: int
    supports_category_2: bool
    license_required: bool
    releases_required: bool
    release_forms_required: bool
    editorial_caption_required: bool
    editorial_date_required: bool
    editorial_location_required: bool
    location_supported: bool
    location_recommended: bool
    iptc_embedded_metadata: bool
    validation_english_required: bool
    validation_keyword_spam_forbidden: bool
    validation_irrelevant_keywords_forbidden: bool
    validation_duplicate_keywords_forbidden: bool
    validation_restricted_terms_forbidden: bool
    validation_accurate_caption_required: bool
    people_supported: bool
    model_release_required_when_people: bool
    license_types: tuple[str, ...]
    categories: tuple[str, ...]


@dataclass(frozen=True)
class StockMappedMetadata:
    """
    Stock-aware представление универсальных metadata для preview/export.
    """

    title: str | None
    description: str | None
    keywords: list[str]
    categories: list[str]
    category_2: str | None
    license_type: str | None
    location_metadata: str | None
    editorial_date: str | None
    is_editorial: bool
    editorial_caption: str | None
    has_people: bool | None
    people_count: int | None
    model_release_available: bool | None
    releases: list[str]
    ai_generated_content_disclosure: bool
    is_illustration: bool | None
    mature_content: bool | None
    iptc_embedded_metadata: bool


GETTY_CATEGORIES: tuple[str, ...] = (
    'Creative',
    'Editorial',
    'Entertainment',
    'News',
    'Sport',
    'Archival',
    'Lifestyle',
    'Business',
    'Travel',
    'Nature',
    'Food',
    'Healthcare',
    'Technology',
)

SHUTTERSTOCK_CATEGORIES: tuple[str, ...] = (
    'Abstract',
    'Animals/Wildlife',
    'Arts',
    'Backgrounds/Textures',
    'Beauty/Fashion',
    'Buildings/Landmarks',
    'Business/Finance',
    'Education',
    'Food and Drink',
    'Healthcare/Medical',
    'Holidays',
    'Industrial',
    'Nature',
    'Objects',
    'Parks/Outdoor',
    'People',
    'Religion',
    'Science',
    'Sports/Recreation',
    'Technology',
    'Transportation',
    'Vintage',
)

ADOBE_CATEGORIES: tuple[str, ...] = (
    'Animals',
    'Buildings and Architecture',
    'Business',
    'Drinks',
    'The Environment',
    'States of Mind',
    'Food',
    'Graphic Resources',
    'Hobbies and Leisure',
    'Industry',
    'Landscape',
    'Lifestyle',
    'People',
    'Plants and Flowers',
    'Culture and Religion',
    'Science',
    'Social Issues',
    'Sports',
    'Technology',
    'Transport',
    'Travel',
)

STOCK_RULES: dict[StockPlatform, StockRules] = {
    StockPlatform.GETTY_IMAGES: StockRules(
        platform_type=StockPlatformType.PREMIUM_STOCK_AGENCY,
        title_required=True,
        title_max_characters=200,
        title_warning_characters=None,
        title_min_words=5,
        title_recommended_min_words=5,
        title_recommended_max_words=15,
        description_required=True,
        description_max_characters=2000,
        image_min_megapixels=3.0,
        image_max_megapixels=256.0,
        keywords_required=True,
        keywords_min_count=5,
        keywords_recommended_min=10,
        keywords_recommended_max=25,
        keywords_max_count=50,
        keywords_order_priority=True,
        keywords_duplicates_allowed=False,
        top_keywords_weighted=False,
        categories_required=True,
        max_categories=2,
        supports_category_2=True,
        license_required=True,
        releases_required=True,
        release_forms_required=True,
        editorial_caption_required=True,
        editorial_date_required=True,
        editorial_location_required=True,
        location_supported=True,
        location_recommended=True,
        iptc_embedded_metadata=True,
        validation_english_required=True,
        validation_keyword_spam_forbidden=True,
        validation_irrelevant_keywords_forbidden=True,
        validation_duplicate_keywords_forbidden=True,
        validation_restricted_terms_forbidden=False,
        validation_accurate_caption_required=True,
        people_supported=True,
        model_release_required_when_people=True,
        license_types=('creative', 'editorial'),
        categories=GETTY_CATEGORIES,
    ),
    StockPlatform.SHUTTERSTOCK: StockRules(
        platform_type=StockPlatformType.MICROSTOCK,
        title_required=True,
        title_max_characters=2048,
        title_warning_characters=150,
        title_min_words=5,
        title_recommended_min_words=None,
        title_recommended_max_words=None,
        description_required=False,
        description_max_characters=2048,
        image_min_megapixels=None,
        image_max_megapixels=None,
        keywords_required=True,
        keywords_min_count=7,
        keywords_recommended_min=15,
        keywords_recommended_max=30,
        keywords_max_count=50,
        keywords_order_priority=True,
        keywords_duplicates_allowed=False,
        top_keywords_weighted=False,
        categories_required=True,
        max_categories=2,
        supports_category_2=True,
        license_required=False,
        releases_required=False,
        release_forms_required=True,
        editorial_caption_required=True,
        editorial_date_required=False,
        editorial_location_required=False,
        location_supported=True,
        location_recommended=False,
        iptc_embedded_metadata=True,
        validation_english_required=True,
        validation_keyword_spam_forbidden=True,
        validation_irrelevant_keywords_forbidden=True,
        validation_duplicate_keywords_forbidden=True,
        validation_restricted_terms_forbidden=False,
        validation_accurate_caption_required=False,
        people_supported=True,
        model_release_required_when_people=True,
        license_types=('commercial', 'editorial'),
        categories=SHUTTERSTOCK_CATEGORIES,
    ),
    StockPlatform.ADOBE_STOCK: StockRules(
        platform_type=StockPlatformType.MICROSTOCK,
        title_required=True,
        title_max_characters=70,
        title_warning_characters=None,
        title_min_words=1,
        title_recommended_min_words=5,
        title_recommended_max_words=10,
        description_required=False,
        description_max_characters=2000,
        image_min_megapixels=None,
        image_max_megapixels=None,
        keywords_required=True,
        keywords_min_count=5,
        keywords_recommended_min=15,
        keywords_recommended_max=35,
        keywords_max_count=49,
        keywords_order_priority=True,
        keywords_duplicates_allowed=False,
        top_keywords_weighted=True,
        categories_required=True,
        max_categories=1,
        supports_category_2=False,
        license_required=False,
        releases_required=True,
        release_forms_required=True,
        editorial_caption_required=True,
        editorial_date_required=False,
        editorial_location_required=False,
        location_supported=True,
        location_recommended=True,
        iptc_embedded_metadata=True,
        validation_english_required=True,
        validation_keyword_spam_forbidden=True,
        validation_irrelevant_keywords_forbidden=True,
        validation_duplicate_keywords_forbidden=True,
        validation_restricted_terms_forbidden=True,
        validation_accurate_caption_required=False,
        people_supported=True,
        model_release_required_when_people=True,
        license_types=('standard', 'extended', 'editorial'),
        categories=ADOBE_CATEGORIES,
    ),
}


def get_stock_rules(stock_platform: StockPlatform) -> StockRules:
    return STOCK_RULES[stock_platform]


def get_stock_field_options(
    stock_platform: StockPlatform,
) -> StockFieldOptions:
    """
    Возвращает справочники и правила метаданных для выбранного стока.
    """
    rules = get_stock_rules(stock_platform)
    return StockFieldOptions(
        stock_platform=stock_platform,
        platform_type=rules.platform_type,
        categories=list(rules.categories),
        license_types=list(rules.license_types),
        title_required=rules.title_required,
        title_min_words=rules.title_min_words,
        title_recommended_min_words=rules.title_recommended_min_words,
        title_recommended_max_words=rules.title_recommended_max_words,
        title_max_characters=rules.title_max_characters,
        title_warning_characters=rules.title_warning_characters,
        description_required=rules.description_required,
        description_max_characters=rules.description_max_characters,
        image_min_megapixels=rules.image_min_megapixels,
        image_max_megapixels=rules.image_max_megapixels,
        keywords_required=rules.keywords_required,
        keywords_min_count=rules.keywords_min_count,
        keywords_recommended_min=rules.keywords_recommended_min,
        keywords_recommended_max=rules.keywords_recommended_max,
        keywords_max_count=rules.keywords_max_count,
        keywords_order_priority=rules.keywords_order_priority,
        keywords_duplicates_allowed=rules.keywords_duplicates_allowed,
        top_keywords_weighted=rules.top_keywords_weighted,
        categories_required=rules.categories_required,
        multi_category_supported=rules.supports_category_2,
        max_categories=rules.max_categories,
        location_supported=rules.location_supported,
        location_recommended=rules.location_recommended,
        iptc_embedded_metadata=rules.iptc_embedded_metadata,
        release_forms_required=rules.release_forms_required,
        editorial_caption_required_for_editorial=(
            rules.editorial_caption_required
        ),
        validation_english_required=rules.validation_english_required,
        validation_keyword_spam_forbidden=(
            rules.validation_keyword_spam_forbidden
        ),
        validation_irrelevant_keywords_forbidden=(
            rules.validation_irrelevant_keywords_forbidden
        ),
        validation_duplicate_keywords_forbidden=(
            rules.validation_duplicate_keywords_forbidden
        ),
        validation_restricted_terms_forbidden=(
            rules.validation_restricted_terms_forbidden
        ),
        validation_accurate_caption_required=(
            rules.validation_accurate_caption_required
        ),
        supports_category_2=rules.supports_category_2,
        license_required=rules.license_required,
        releases_required=rules.releases_required,
        editorial_caption_required=rules.editorial_caption_required,
        editorial_date_required=rules.editorial_date_required,
        editorial_location_required=rules.editorial_location_required,
        people_supported=rules.people_supported,
        model_release_required_when_people=(
            rules.model_release_required_when_people
        ),
    )


def get_effective_categories(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> list[str]:
    """
    Возвращает категории файла в формате выбранного стока.
    """
    rules = get_stock_rules(stock_platform)
    categories = list(file.categories)

    if file.category_2 and file.category_2 not in categories:
        categories.append(file.category_2)

    if not rules.supports_category_2:
        return categories[:1]

    return categories[: rules.max_categories]


def build_stock_mapped_metadata(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> StockMappedMetadata:
    """
    Преобразует универсальные metadata в представление выбранного стока.
    """
    mapped_categories = get_effective_categories(file, stock_platform)
    mapped_category_2 = (
        mapped_categories[1] if len(mapped_categories) > 1 else None
    )

    return StockMappedMetadata(
        title=file.title,
        description=file.description,
        keywords=list(file.keywords),
        categories=mapped_categories,
        category_2=mapped_category_2,
        license_type=file.license_type,
        location_metadata=file.location_metadata,
        editorial_date=file.editorial_date,
        is_editorial=file.is_editorial,
        editorial_caption=file.editorial_caption,
        has_people=file.has_people,
        people_count=file.people_count,
        model_release_available=file.model_release_available,
        releases=list(file.releases),
        ai_generated_content_disclosure=file.ai_generated_content_disclosure,
        is_illustration=file.is_illustration,
        mature_content=file.mature_content,
        iptc_embedded_metadata=file.iptc_embedded_metadata,
    )


def build_stock_aware_preview(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> StockAwareMetadataPreview:
    """
    Формирует stock-aware preview только с релевантными полями платформы.
    """
    mapped = build_stock_mapped_metadata(file, stock_platform)
    validation = validate_file_metadata_for_stock(file, stock_platform)

    common_fields = [
        StockPreviewField(
            key='filename',
            label='Filename',
            value=file.original_filename,
        ),
        StockPreviewField(
            key='title',
            label='Title',
            value=mapped.title or '',
        ),
        StockPreviewField(
            key='description',
            label='Description',
            value=mapped.description or '',
        ),
        StockPreviewField(
            key='keywords',
            label='Keywords',
            value=list(mapped.keywords),
        ),
    ]

    if stock_platform == StockPlatform.SHUTTERSTOCK:
        stock_specific = StockSpecificPreviewBlock(
            title='Shutterstock Specific',
            fields=[
                StockPreviewField(
                    key='categories',
                    label='Categories',
                    value=list(mapped.categories),
                ),
                StockPreviewField(
                    key='category_2',
                    label='Category 2',
                    value=mapped.category_2,
                ),
                StockPreviewField(
                    key='is_illustration',
                    label='Illustration',
                    value=mapped.is_illustration,
                ),
                StockPreviewField(
                    key='mature_content',
                    label='Mature Content',
                    value=mapped.mature_content,
                ),
                StockPreviewField(
                    key='is_editorial',
                    label='Editorial',
                    value=mapped.is_editorial,
                ),
                StockPreviewField(
                    key='location_metadata',
                    label='Location',
                    value=mapped.location_metadata,
                ),
                StockPreviewField(
                    key='releases',
                    label='Releases',
                    value=list(mapped.releases),
                ),
            ],
        )
    elif stock_platform == StockPlatform.GETTY_IMAGES:
        stock_specific = StockSpecificPreviewBlock(
            title='Getty Specific',
            fields=[
                StockPreviewField(
                    key='categories',
                    label='Categories',
                    value=list(mapped.categories),
                ),
                StockPreviewField(
                    key='category_2',
                    label='Category 2',
                    value=mapped.category_2,
                ),
                StockPreviewField(
                    key='license_type',
                    label='License Type',
                    value=mapped.license_type,
                ),
                StockPreviewField(
                    key='is_editorial',
                    label='Editorial',
                    value=mapped.is_editorial,
                ),
                StockPreviewField(
                    key='editorial_caption',
                    label='Editorial Caption',
                    value=mapped.editorial_caption,
                ),
                StockPreviewField(
                    key='editorial_date',
                    label='Editorial Date',
                    value=mapped.editorial_date,
                ),
                StockPreviewField(
                    key='location_metadata',
                    label='Location',
                    value=mapped.location_metadata,
                ),
                StockPreviewField(
                    key='releases',
                    label='Releases',
                    value=list(mapped.releases),
                ),
            ],
        )
    else:
        stock_specific = StockSpecificPreviewBlock(
            title='Adobe Specific',
            fields=[
                StockPreviewField(
                    key='category',
                    label='Category',
                    value=mapped.categories[0] if mapped.categories else None,
                ),
                StockPreviewField(
                    key='is_editorial',
                    label='Editorial',
                    value=mapped.is_editorial,
                ),
                StockPreviewField(
                    key='editorial_caption',
                    label='Editorial Caption',
                    value=mapped.editorial_caption,
                ),
                StockPreviewField(
                    key='location_metadata',
                    label='Location',
                    value=mapped.location_metadata,
                ),
                StockPreviewField(
                    key='releases',
                    label='Releases',
                    value=list(mapped.releases),
                ),
                StockPreviewField(
                    key='ai_generated_content_disclosure',
                    label='AI Disclosure',
                    value=mapped.ai_generated_content_disclosure,
                ),
                StockPreviewField(
                    key='is_illustration',
                    label='Illustration',
                    value=mapped.is_illustration,
                ),
                StockPreviewField(
                    key='mature_content',
                    label='Mature Content',
                    value=mapped.mature_content,
                ),
            ],
        )

    return StockAwareMetadataPreview(
        stock_platform=stock_platform,
        common_fields=common_fields,
        stock_specific=stock_specific,
        errors=list(validation.errors),
        warnings=list(validation.warnings),
    )


def build_stock_iptc_payload(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> IPTCEmbeddingPayload:
    mapped_metadata = build_stock_mapped_metadata(file, stock_platform)
    caption = mapped_metadata.description or ''

    if mapped_metadata.is_editorial and mapped_metadata.editorial_caption:
        caption = mapped_metadata.editorial_caption

    return IPTCEmbeddingPayload(
        object_name=mapped_metadata.title or '',
        caption_abstract=caption,
        keywords=list(mapped_metadata.keywords),
        supplemental_category=list(mapped_metadata.categories),
        city=mapped_metadata.location_metadata,
        date_created=(
            mapped_metadata.editorial_date
            if mapped_metadata.is_editorial
            else None
        ),
        special_instructions=_build_stock_iptc_special_instructions(
            mapped_metadata,
            stock_platform,
        ),
    )


def _build_stock_iptc_special_instructions(
    mapped_metadata: StockMappedMetadata,
    stock_platform: StockPlatform,
) -> str | None:
    parts: list[str] = []

    if mapped_metadata.license_type:
        parts.append(f'license={mapped_metadata.license_type}')

    if mapped_metadata.releases:
        parts.append(f'releases={", ".join(mapped_metadata.releases)}')
    elif mapped_metadata.model_release_available is not None:
        release_value = (
            'yes' if mapped_metadata.model_release_available else 'no'
        )
        parts.append(f'model_release={release_value}')

    if stock_platform == StockPlatform.SHUTTERSTOCK:
        if mapped_metadata.is_illustration is not None:
            illustration_value = (
                'yes' if mapped_metadata.is_illustration else 'no'
            )
            parts.append(f'illustration={illustration_value}')
        if mapped_metadata.mature_content is not None:
            mature_value = 'yes' if mapped_metadata.mature_content else 'no'
            parts.append(f'mature_content={mature_value}')

    if stock_platform == StockPlatform.GETTY_IMAGES:
        if mapped_metadata.is_editorial:
            parts.append('editorial=yes')
        if mapped_metadata.editorial_date:
            parts.append(f'editorial_date={mapped_metadata.editorial_date}')
        if mapped_metadata.location_metadata:
            parts.append(f'location={mapped_metadata.location_metadata}')

    if stock_platform == StockPlatform.ADOBE_STOCK:
        if mapped_metadata.ai_generated_content_disclosure:
            parts.append('ai_generated=yes')
        if mapped_metadata.is_illustration is not None:
            illustration_value = (
                'yes' if mapped_metadata.is_illustration else 'no'
            )
            parts.append(f'illustration={illustration_value}')
        if mapped_metadata.mature_content is not None:
            mature_value = 'yes' if mapped_metadata.mature_content else 'no'
            parts.append(f'mature_content={mature_value}')

    if not parts:
        return None

    return '; '.join(parts)


def _collect_validation_categories(file: ProcessingJobFile) -> list[str]:
    """
    Возвращает исходный набор категорий для валидации без platform-trimming.
    """
    categories = list(file.categories)

    if file.category_2:
        categories.append(file.category_2)

    return categories


def _build_restricted_terms_message(terms: list[str]) -> str:
    preview_terms = terms[:10]
    preview = ', '.join(preview_terms)

    if len(terms) > 10:
        preview = f'{preview}, ...'

    return (
        'Restricted names/brands/franchises detected: '
        f'{preview}. Use generic terms instead.'
    )


def _resolve_file_megapixels(file: ProcessingJobFile) -> float | None:
    if file.status == FileStatus.FAILED:
        return None

    try:
        file_path = get_upload_file_path(file.filename)
        with Image.open(file_path) as image:
            width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError, RuntimeError):
        return None
    except Exception:
        return None

    if width <= 0 or height <= 0:
        return None

    return (width * height) / 1_000_000


def validate_file_metadata_for_stock(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> MetadataValidationResult:
    """
    Проверяет metadata одного файла по правилам выбранной платформы.
    """
    rules = get_stock_rules(stock_platform)
    errors: list[MetadataValidationIssue] = []
    warnings: list[MetadataValidationIssue] = []

    title = file.title or ''
    description = file.description or ''
    keywords = list(file.keywords)
    effective_categories = get_effective_categories(file, stock_platform)
    validation_categories = effective_categories

    if rules.title_required and not title:
        errors.append(
            MetadataValidationIssue(
                field='title',
                code='required',
                message='Title is required.',
            )
        )
    elif title:
        if len(title) > rules.title_max_characters:
            errors.append(
                MetadataValidationIssue(
                    field='title',
                    code='max_length_exceeded',
                    message=(
                        f'Title is too long for {stock_platform.value}. '
                        f'Max {rules.title_max_characters} characters.'
                    ),
                )
            )

        if (
            rules.title_warning_characters is not None
            and rules.title_warning_characters
            < len(title)
            <= rules.title_max_characters
        ):
            warnings.append(
                MetadataValidationIssue(
                    field='title',
                    code='recommended_length_exceeded',
                    message=(
                        'Title is longer than recommended '
                        f'({rules.title_warning_characters}+ characters).'
                    ),
                )
            )

        title_words_count = len(title.split())

        if title_words_count < rules.title_min_words:
            errors.append(
                MetadataValidationIssue(
                    field='title',
                    code='min_words_not_met',
                    message=(
                        f'Title must contain at least '
                        f'{rules.title_min_words} words.'
                    ),
                )
            )

        if (
            rules.title_recommended_min_words is not None
            and rules.title_min_words
            <= title_words_count
            < rules.title_recommended_min_words
        ):
            warnings.append(
                MetadataValidationIssue(
                    field='title',
                    code='recommended_words_not_met',
                    message=(
                        'Title is shorter than recommended '
                        f'({rules.title_recommended_min_words}+ words).'
                    ),
                )
            )

        if (
            rules.title_recommended_max_words is not None
            and title_words_count > rules.title_recommended_max_words
        ):
            warnings.append(
                MetadataValidationIssue(
                    field='title',
                    code='recommended_words_exceeded',
                    message=(
                        'Title is longer than recommended '
                        f'({rules.title_recommended_max_words} words max).'
                    ),
                )
            )

    if rules.description_required and not description:
        errors.append(
            MetadataValidationIssue(
                field='description',
                code='required',
                message='Description is required.',
            )
        )
    if description and len(description) > rules.description_max_characters:
        errors.append(
            MetadataValidationIssue(
                field='description',
                code='max_length_exceeded',
                message=(
                    f'Description is too long for {stock_platform.value}. '
                    f'Max {rules.description_max_characters} characters.'
                ),
            )
        )

    if (
        rules.image_min_megapixels is not None
        or rules.image_max_megapixels is not None
    ):
        megapixels = _resolve_file_megapixels(file)

        if megapixels is None:
            warnings.append(
                MetadataValidationIssue(
                    field='image',
                    code='megapixels_unavailable',
                    message='Unable to read image resolution for validation.',
                )
            )
        else:
            if (
                rules.image_min_megapixels is not None
                and megapixels < rules.image_min_megapixels
            ):
                errors.append(
                    MetadataValidationIssue(
                        field='image',
                        code='min_megapixels_not_met',
                        message=(
                            f'Image is too small for {stock_platform.value}. '
                            f'Min {rules.image_min_megapixels:.1f} MP '
                            f'(current {megapixels:.2f} MP).'
                        ),
                    )
                )

            if (
                rules.image_max_megapixels is not None
                and megapixels > rules.image_max_megapixels
            ):
                errors.append(
                    MetadataValidationIssue(
                        field='image',
                        code='max_megapixels_exceeded',
                        message=(
                            f'Image is too large for {stock_platform.value}. '
                            f'Max {rules.image_max_megapixels:.1f} MP '
                            f'(current {megapixels:.2f} MP).'
                        ),
                    )
                )

    if rules.validation_restricted_terms_forbidden:
        title_restricted_terms = find_restricted_terms_in_text(title)
        if title_restricted_terms:
            errors.append(
                MetadataValidationIssue(
                    field='title',
                    code='restricted_term_forbidden',
                    message=_build_restricted_terms_message(
                        title_restricted_terms
                    ),
                )
            )

        description_restricted_terms = find_restricted_terms_in_text(
            description
        )
        if description_restricted_terms:
            errors.append(
                MetadataValidationIssue(
                    field='description',
                    code='restricted_term_forbidden',
                    message=_build_restricted_terms_message(
                        description_restricted_terms
                    ),
                )
            )

        keywords_restricted_terms = find_restricted_terms_in_text(
            ', '.join(keywords)
        )
        if keywords_restricted_terms:
            errors.append(
                MetadataValidationIssue(
                    field='keywords',
                    code='restricted_term_forbidden',
                    message=_build_restricted_terms_message(
                        keywords_restricted_terms
                    ),
                )
            )

    if rules.keywords_required and len(keywords) < rules.keywords_min_count:
        errors.append(
            MetadataValidationIssue(
                field='keywords',
                code='min_items_not_met',
                message=(
                    f'At least {rules.keywords_min_count} '
                    'keywords are required.'
                ),
            )
        )
    if len(keywords) > rules.keywords_max_count:
        errors.append(
            MetadataValidationIssue(
                field='keywords',
                code='max_items_exceeded',
                message=(
                    f'Maximum {rules.keywords_max_count} keywords are allowed.'
                ),
            )
        )
    if len(keywords) < rules.keywords_recommended_min:
        warnings.append(
            MetadataValidationIssue(
                field='keywords',
                code='recommended_min_not_met',
                message=(
                    f'Recommended minimum is '
                    f'{rules.keywords_recommended_min} keywords.'
                ),
            )
        )

    if not rules.keywords_duplicates_allowed:
        normalized_keywords = [
            keyword.strip().lower() for keyword in keywords if keyword.strip()
        ]
        if len(normalized_keywords) != len(set(normalized_keywords)):
            errors.append(
                MetadataValidationIssue(
                    field='keywords',
                    code='duplicate_items_forbidden',
                    message='Duplicate keywords are not allowed.',
                )
            )
    if len(keywords) > rules.keywords_recommended_max:
        warnings.append(
            MetadataValidationIssue(
                field='keywords',
                code='recommended_max_exceeded',
                message=(
                    f'Recommended maximum is '
                    f'{rules.keywords_recommended_max} keywords.'
                ),
            )
        )

    if rules.categories_required and not effective_categories:
        errors.append(
            MetadataValidationIssue(
                field='categories',
                code='required',
                message='Category is required.',
            )
        )
    if len(validation_categories) > rules.max_categories:
        errors.append(
            MetadataValidationIssue(
                field='categories',
                code='max_items_exceeded',
                message=(
                    f'Maximum {rules.max_categories} categories are allowed.'
                ),
            )
        )

    invalid_categories = [
        category
        for category in validation_categories
        if category not in rules.categories
    ]
    if invalid_categories:
        unique_invalid_categories = list(dict.fromkeys(invalid_categories))
        errors.append(
            MetadataValidationIssue(
                field='categories',
                code='invalid_value',
                message=(
                    'Unsupported category values for selected platform: '
                    + ', '.join(unique_invalid_categories)
                ),
            )
        )

    if rules.license_required and not file.license_type:
        errors.append(
            MetadataValidationIssue(
                field='license_type',
                code='required',
                message='License type is required.',
            )
        )

    if file.license_type and file.license_type not in rules.license_types:
        errors.append(
            MetadataValidationIssue(
                field='license_type',
                code='invalid_value',
                message='Unsupported license type for selected platform.',
            )
        )

    has_release_data = bool(file.releases) or (
        file.model_release_available is True
    )
    should_require_release = file.has_people is not False

    if (
        rules.releases_required
        and should_require_release
        and not has_release_data
    ):
        warnings.append(
            MetadataValidationIssue(
                field='model_release_available',
                code='recommended',
                message='Release information is recommended.',
            )
        )

    if file.model_release_available is True and file.has_people is False:
        warnings.append(
            MetadataValidationIssue(
                field='model_release_available',
                code='inconsistent',
                message='Model release is marked, but has_people is false.',
            )
        )

    if file.has_people is True and file.people_count == 0:
        warnings.append(
            MetadataValidationIssue(
                field='people_count',
                code='inconsistent',
                message='people_count is 0 while has_people is true.',
            )
        )

    if (
        file.people_count
        and file.people_count > 0
        and file.has_people is False
    ):
        warnings.append(
            MetadataValidationIssue(
                field='has_people',
                code='inconsistent',
                message=(
                    'people_count is greater than 0 while has_people is false.'
                ),
            )
        )

    if file.is_editorial and file.license_type == 'commercial':
        warnings.append(
            MetadataValidationIssue(
                field='license_type',
                code='inconsistent',
                message=(
                    'Editorial content should not have '
                    'commercial license type.'
                ),
            )
        )

    if file.license_type == 'editorial' and file.is_editorial is False:
        warnings.append(
            MetadataValidationIssue(
                field='is_editorial',
                code='inconsistent',
                message=(
                    'license_type is editorial while is_editorial is false.'
                ),
            )
        )

    if file.is_editorial:
        if rules.editorial_caption_required and not file.editorial_caption:
            errors.append(
                MetadataValidationIssue(
                    field='editorial_caption',
                    code='required',
                    message=(
                        'Editorial caption is required for editorial files.'
                    ),
                )
            )

        if rules.editorial_date_required and not file.editorial_date:
            errors.append(
                MetadataValidationIssue(
                    field='editorial_date',
                    code='required',
                    message='Editorial date is required for editorial files.',
                )
            )

        if rules.editorial_location_required and not file.location_metadata:
            errors.append(
                MetadataValidationIssue(
                    field='location_metadata',
                    code='required',
                    message=(
                        'Location is required for editorial files '
                        'on this platform.'
                    ),
                )
            )

    return MetadataValidationResult(
        errors=errors,
        warnings=warnings,
    )


def _build_stock_iptc_special_instructions(
    mapped_metadata: StockMappedMetadata,
    stock_platform: StockPlatform,
) -> str | None:
    parts: list[str] = []

    if mapped_metadata.license_type:
        parts.append(f'license={mapped_metadata.license_type}')

    if mapped_metadata.releases:
        parts.append(f'releases={", ".join(mapped_metadata.releases)}')
    elif mapped_metadata.model_release_available is not None:
        release_value = (
            'yes' if mapped_metadata.model_release_available else 'no'
        )
        parts.append(f'model_release={release_value}')

    if stock_platform == StockPlatform.SHUTTERSTOCK:
        if mapped_metadata.is_illustration is not None:
            illustration_value = (
                'yes' if mapped_metadata.is_illustration else 'no'
            )
            parts.append(f'illustration={illustration_value}')
        if mapped_metadata.mature_content is not None:
            mature_value = 'yes' if mapped_metadata.mature_content else 'no'
            parts.append(f'mature_content={mature_value}')

    if stock_platform == StockPlatform.GETTY_IMAGES:
        if mapped_metadata.is_editorial:
            parts.append('editorial=yes')
        if mapped_metadata.editorial_date:
            parts.append(f'editorial_date={mapped_metadata.editorial_date}')
        if mapped_metadata.location_metadata:
            parts.append(f'location={mapped_metadata.location_metadata}')

    if stock_platform == StockPlatform.ADOBE_STOCK:
        if mapped_metadata.ai_generated_content_disclosure:
            parts.append('ai_generated=yes')
        if mapped_metadata.is_illustration is not None:
            illustration_value = (
                'yes' if mapped_metadata.is_illustration else 'no'
            )
            parts.append(f'illustration={illustration_value}')
        if mapped_metadata.mature_content is not None:
            mature_value = 'yes' if mapped_metadata.mature_content else 'no'
            parts.append(f'mature_content={mature_value}')

    if not parts:
        return None

    return '; '.join(parts)


def _collect_validation_categories(file: ProcessingJobFile) -> list[str]:
    """
    Возвращает исходный набор категорий для валидации без platform-trimming.
    """
    categories = list(file.categories)

    if file.category_2:
        categories.append(file.category_2)

    return categories


def _build_restricted_terms_message(terms: list[str]) -> str:
    preview_terms = terms[:10]
    preview = ', '.join(preview_terms)

    if len(terms) > 10:
        preview = f'{preview}, ...'

    return (
        'Restricted names/brands/franchises detected: '
        f'{preview}. Use generic terms instead.'
    )


def _resolve_file_megapixels(file: ProcessingJobFile) -> float | None:
    if file.status == FileStatus.FAILED:
        return None

    try:
        file_path = get_upload_file_path(file.filename)
        with Image.open(file_path) as image:
            width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError, RuntimeError):
        return None
    except Exception:
        return None

    if width <= 0 or height <= 0:
        return None

    return (width * height) / 1_000_000
