from app.core.enums import MetadataFieldSource, StockPlatform
from app.schemas.job import MetadataValidationIssue, ProcessingJobFile
from app.services.metadata.stock_mapping import (
    _get_stock_title_characters_limit,
    map_stock_title,
)
from app.services.metadata.stock_mapping_data import DEFAULT_STOCK_CATEGORIES
from app.services.metadata.stock_rules import get_stock_rules
from app.services.metadata.stock_rules_data import StockRules
from app.services.metadata.stock_validation import (
    validate_file_metadata_for_stock,
)


def apply_stock_metadata_autofixes(
    file: ProcessingJobFile,
    stock_platform: StockPlatform | None,
) -> None:
    """
    Применяет безопасные правки формальных ошибок стока.

    Ручные правки сохраняются: если пользователь изменил поле, backend не
    должен тихо переписывать его выбор.
    """
    if stock_platform is None:
        return

    rules = get_stock_rules(stock_platform)
    for _ in range(3):
        validation = validate_file_metadata_for_stock(file, stock_platform)
        fixed_errors_count = 0

        for error in validation.errors:
            if _apply_autofix_for_error(file, stock_platform, rules, error):
                fixed_errors_count += 1

        if fixed_errors_count == 0:
            break


def _apply_autofix_for_error(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
    rules: StockRules,
    error: MetadataValidationIssue,
) -> bool:
    autofix_rule = (error.field, error.code)

    if autofix_rule == ('title', 'required'):
        return _ensure_generated_title_exists(file)
    elif autofix_rule == ('title', 'min_words_not_met'):
        return _ensure_generated_title_has_min_words(file, rules)
    elif autofix_rule == ('title', 'max_length_exceeded'):
        return _trim_generated_title(file, rules)
    elif autofix_rule == ('description', 'required'):
        return _ensure_generated_description_exists(file)
    elif autofix_rule == ('description', 'max_length_exceeded'):
        return _trim_generated_description(file, rules)
    elif autofix_rule == ('keywords', 'min_items_not_met'):
        return _ensure_generated_keywords_min_count(file, rules)
    elif autofix_rule == ('keywords', 'max_items_exceeded'):
        return _trim_generated_keywords(file, rules)
    elif autofix_rule == ('keywords', 'duplicate_items_forbidden'):
        return _dedupe_generated_keywords(file)
    elif autofix_rule == ('categories', 'required'):
        return _ensure_generated_category_exists(file, stock_platform)
    elif autofix_rule == ('categories', 'max_items_exceeded'):
        return _trim_generated_categories(file, rules)

    return False


def _ensure_generated_title_has_min_words(
    file: ProcessingJobFile,
    rules: StockRules,
) -> bool:
    if _is_edited(file, 'title'):
        return False

    # Слова считаем по mapped-заголовку — тому же, что видит валидатор
    # (map_stock_title обрезает и по символам, и по числу слов). Иначе при
    # пограничном заголовке автофикс «видит» достаточно слов в сыром title,
    # хотя после обрезки их не хватает, и правка не применяется.
    mapped_title = map_stock_title(file, rules) or ''
    title_words = mapped_title.split()

    if len(title_words) >= rules.title_min_words:
        return False

    # Добиваем слова, не выходя за символьный лимит мэппинга, чтобы
    # добавленное не срезалось при отображении и заголовок реально прошёл
    # валидацию.
    characters_limit = _get_stock_title_characters_limit(rules)
    candidate_words = [
        word
        for source_text in _title_word_sources(file)
        for word in _split_words(source_text)
    ]
    candidate_words.extend(('stock', 'photo', 'image', 'background', 'scene'))

    for word in candidate_words:
        if len(title_words) >= rules.title_min_words:
            break

        candidate_title = ' '.join((*title_words, word))

        if len(candidate_title) > characters_limit:
            continue

        title_words.append(word)

    if len(title_words) < rules.title_min_words:
        return False

    new_title = ' '.join(title_words)

    if file.title == new_title:
        return False

    file.title = new_title
    return True


def _ensure_generated_title_exists(file: ProcessingJobFile) -> bool:
    if _is_edited(file, 'title'):
        return False

    title = (
        file.description
        or ' '.join(file.keywords[:5])
        or file.original_filename
    )

    if file.title == title:
        return False

    file.title = title
    return True


def _trim_generated_title(
    file: ProcessingJobFile,
    rules: StockRules,
) -> bool:
    if _is_edited(file, 'title') or not file.title:
        return False

    title = _trim_text_to_limit(file.title, rules.title_max_characters)

    if file.title == title:
        return False

    file.title = title
    return True


def _ensure_generated_description_exists(file: ProcessingJobFile) -> bool:
    if _is_edited(file, 'description'):
        return False

    description = file.description or file.title

    if file.description == description:
        return False

    file.description = description
    return True


def _trim_generated_description(
    file: ProcessingJobFile,
    rules: StockRules,
) -> bool:
    if _is_edited(file, 'description') or not file.description:
        return False

    description = _trim_text_to_limit(
        file.description,
        rules.description_max_characters,
    )

    if file.description == description:
        return False

    file.description = description
    return True


def _ensure_generated_keywords_min_count(
    file: ProcessingJobFile,
    rules: StockRules,
) -> bool:
    if _is_edited(file, 'keywords'):
        return False

    keywords = list(file.keywords)

    for keyword in _keyword_sources(file):
        if len(keywords) >= rules.keywords_min_count:
            break

        if not keyword or keyword in keywords:
            continue

        keywords.append(keyword)

    if file.keywords == keywords:
        return False

    file.keywords = keywords
    return True


def _trim_generated_keywords(
    file: ProcessingJobFile,
    rules: StockRules,
) -> bool:
    if _is_edited(file, 'keywords'):
        return False

    keywords = file.keywords[: rules.keywords_max_count]

    if file.keywords == keywords:
        return False

    file.keywords = keywords
    return True


def _dedupe_generated_keywords(file: ProcessingJobFile) -> bool:
    if _is_edited(file, 'keywords'):
        return False

    deduped_keywords: list[str] = []
    seen_keywords: set[str] = set()

    for keyword in file.keywords:
        dedupe_key = keyword.lower()

        if dedupe_key in seen_keywords:
            continue

        deduped_keywords.append(keyword)
        seen_keywords.add(dedupe_key)

    if file.keywords == deduped_keywords:
        return False

    file.keywords = deduped_keywords
    return True


def _ensure_generated_category_exists(
    file: ProcessingJobFile,
    stock_platform: StockPlatform,
) -> bool:
    if _is_edited(file, 'categories'):
        return False

    categories = file.categories or [DEFAULT_STOCK_CATEGORIES[stock_platform]]

    if file.categories == categories:
        return False

    file.categories = categories
    return True


def _trim_generated_categories(
    file: ProcessingJobFile,
    rules: StockRules,
) -> bool:
    if _is_edited(file, 'categories'):
        return False

    categories = file.categories[: rules.max_categories]
    category_2 = file.category_2

    if len(categories) >= rules.max_categories and not _is_edited(
        file,
        'category_2',
    ):
        category_2 = None

    if file.categories == categories and file.category_2 == category_2:
        return False

    file.categories = categories
    file.category_2 = category_2
    return True


def _is_edited(file: ProcessingJobFile, field_name: str) -> bool:
    return file.field_sources.get(field_name) == MetadataFieldSource.EDITED


def _title_word_sources(file: ProcessingJobFile) -> list[str | None]:
    return [
        file.description,
        *file.keywords,
        *file.categories,
        file.category_2,
    ]


def _split_words(value: str | None) -> list[str]:
    if not value:
        return []

    return value.split()


def _keyword_sources(file: ProcessingJobFile) -> list[str]:
    return [
        *file.categories,
        *([file.category_2] if file.category_2 else []),
        *_split_words(file.title),
        *_split_words(file.description),
        'stock',
        'photo',
        'image',
        'background',
        'scene',
    ]


def _trim_text_to_limit(value: str, max_characters: int) -> str:
    if len(value) <= max_characters:
        return value

    trimmed_value = value[:max_characters].rstrip()
    return trimmed_value.rsplit(' ', 1)[0] or trimmed_value
