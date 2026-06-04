from PIL import Image, UnidentifiedImageError

from app.core.enums import FileStatus, StockPlatform
from app.schemas.job import (
    MetadataValidationIssue,
    MetadataValidationResult,
    ProcessingJobFile,
)
from app.services.metadata.metadata_embedding import get_upload_file_path
from app.services.metadata.stock_mapping import (
    StockMappedMetadata,
    build_stock_mapped_metadata,
)
from app.services.metadata.stock_rules import get_stock_rules
from app.services.metadata.stock_validation_lists import (
    find_restricted_terms_in_text,
)


def validate_file_metadata_for_stock(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> MetadataValidationResult:
    """
    Проверяет metadata одного файла по правилам выбранной платформы.
    """
    rules = get_stock_rules(stock_platform)
    mapped_metadata = build_stock_mapped_metadata(file, stock_platform)
    errors: list[MetadataValidationIssue] = []
    warnings: list[MetadataValidationIssue] = []

    title = mapped_metadata.title or ''
    description = mapped_metadata.description or ''
    keywords = list(mapped_metadata.keywords)
    effective_categories = list(mapped_metadata.categories)
    validation_categories = _collect_validation_categories(mapped_metadata)

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

    if rules.license_required and not mapped_metadata.license_type:
        errors.append(
            MetadataValidationIssue(
                field='license_type',
                code='required',
                message='License type is required.',
            )
        )

    if (
        mapped_metadata.license_type
        and mapped_metadata.license_type not in rules.license_types
    ):
        errors.append(
            MetadataValidationIssue(
                field='license_type',
                code='invalid_value',
                message='Unsupported license type for selected platform.',
            )
        )

    has_release_data = bool(mapped_metadata.releases) or (
        mapped_metadata.model_release_available is True
    )
    should_require_release = mapped_metadata.has_people is not False

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

    if (
        mapped_metadata.model_release_available is True
        and mapped_metadata.has_people is False
    ):
        warnings.append(
            MetadataValidationIssue(
                field='model_release_available',
                code='inconsistent',
                message='Model release is marked, but has_people is false.',
            )
        )

    if (
        mapped_metadata.has_people is True
        and mapped_metadata.people_count == 0
    ):
        warnings.append(
            MetadataValidationIssue(
                field='people_count',
                code='inconsistent',
                message='people_count is 0 while has_people is true.',
            )
        )

    if (
        mapped_metadata.people_count
        and mapped_metadata.people_count > 0
        and mapped_metadata.has_people is False
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

    if (
        mapped_metadata.is_editorial
        and mapped_metadata.license_type == 'commercial'
    ):
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

    if (
        mapped_metadata.license_type == 'editorial'
        and mapped_metadata.is_editorial is False
    ):
        warnings.append(
            MetadataValidationIssue(
                field='is_editorial',
                code='inconsistent',
                message=(
                    'license_type is editorial while is_editorial is false.'
                ),
            )
        )

    if mapped_metadata.is_editorial:
        if (
            rules.editorial_caption_required
            and not mapped_metadata.editorial_caption
        ):
            errors.append(
                MetadataValidationIssue(
                    field='editorial_caption',
                    code='required',
                    message=(
                        'Editorial caption is required for editorial files.'
                    ),
                )
            )

        if (
            rules.editorial_date_required
            and not mapped_metadata.editorial_date
        ):
            errors.append(
                MetadataValidationIssue(
                    field='editorial_date',
                    code='required',
                    message='Editorial date is required for editorial files.',
                )
            )

        if (
            rules.editorial_location_required
            and not mapped_metadata.location_metadata
        ):
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


def _collect_validation_categories(
    mapped_metadata: StockMappedMetadata,
) -> list[str]:
    """
    Возвращает mapped-набор категорий для platform validation.
    """
    categories = list(mapped_metadata.categories)

    if (
        mapped_metadata.category_2
        and mapped_metadata.category_2 not in categories
    ):
        categories.append(mapped_metadata.category_2)

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
