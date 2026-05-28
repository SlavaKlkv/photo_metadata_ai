import re
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """
    Приводит имя файла к безопасному формату для хранения на сервере.
    """
    stem = Path(filename).stem.lower()
    stem = re.sub(r'\s+', '_', stem)
    stem = re.sub(r'[^a-z0-9_-]', '', stem)
    stem = re.sub(r'_+', '_', stem).strip('_-')

    return stem or 'uploaded_file'


def sanitize_metadata_text(value: str | None) -> str | None:
    """
    Очищает текстовое metadata-поле от лишних пробелов.
    """
    if value is None:
        return None

    sanitized_value = ' '.join(value.strip().split())

    return sanitized_value or None


def sanitize_keywords(value: list[str] | None) -> list[str]:
    """
    Очищает keywords и удаляет дубликаты с сохранением порядка.
    """
    if value is None:
        return []

    sanitized_keywords: list[str] = []
    seen_keywords: set[str] = set()

    for keyword in value:
        sanitized_keyword = ' '.join(str(keyword).strip().lower().split())

        if not sanitized_keyword or sanitized_keyword in seen_keywords:
            continue

        sanitized_keywords.append(sanitized_keyword)
        seen_keywords.add(sanitized_keyword)

    return sanitized_keywords


def sanitize_string_list(value: list[str] | None) -> list[str]:
    """
    Очищает список строк и удаляет дубликаты с сохранением порядка.
    """
    if value is None:
        return []

    sanitized_values: list[str] = []
    seen_values: set[str] = set()

    for item in value:
        normalized_item = ' '.join(str(item).strip().split())

        if not normalized_item:
            continue

        dedupe_key = normalized_item.lower()

        if dedupe_key in seen_values:
            continue

        sanitized_values.append(normalized_item)
        seen_values.add(dedupe_key)

    return sanitized_values
