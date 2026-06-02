import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ADOBE_RESTRICTED_TERMS_FILE = (
    Path(__file__).resolve().parents[2]
    / 'data'
    / 'stock_validation'
    / 'adobe'
    / 'restricted_terms.v1.json'
)


@dataclass(frozen=True)
class AdobeRestrictedTerms:
    version: str
    brands: tuple[str, ...]
    person_names: tuple[str, ...]
    franchises: tuple[str, ...]
    all_terms: tuple[str, ...]
    all_term_patterns: tuple[tuple[str, re.Pattern[str]], ...]


def _normalize_text(value: str) -> str:
    normalized = value.lower().replace('_', ' ').replace('-', ' ')
    return ' '.join(normalized.split())


def _dedupe_terms(terms: list[str]) -> tuple[str, ...]:
    unique_terms: list[str] = []
    seen_terms: set[str] = set()

    for term in terms:
        normalized_term = _normalize_text(term)
        if not normalized_term or normalized_term in seen_terms:
            continue
        unique_terms.append(normalized_term)
        seen_terms.add(normalized_term)

    return tuple(unique_terms)


def _compile_term_pattern(term: str) -> re.Pattern[str]:
    return re.compile(
        rf'(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])',
        flags=re.IGNORECASE,
    )


@lru_cache(maxsize=1)
def load_adobe_restricted_terms() -> AdobeRestrictedTerms:
    payload = json.loads(ADOBE_RESTRICTED_TERMS_FILE.read_text('utf-8'))

    brands = _dedupe_terms(payload.get('brands', []))
    person_names = _dedupe_terms(payload.get('person_names', []))
    franchises = _dedupe_terms(payload.get('franchises', []))
    all_terms = _dedupe_terms(
        [
            *brands,
            *person_names,
            *franchises,
        ]
    )

    term_patterns = tuple(
        (term, _compile_term_pattern(term)) for term in all_terms
    )

    return AdobeRestrictedTerms(
        version=str(payload.get('version', 'v1')),
        brands=brands,
        person_names=person_names,
        franchises=franchises,
        all_terms=all_terms,
        all_term_patterns=term_patterns,
    )


def find_restricted_terms_in_text(text: str) -> list[str]:
    normalized_text = _normalize_text(text)

    if not normalized_text:
        return []

    restricted_terms = load_adobe_restricted_terms()
    matched_terms: list[str] = []

    for term, term_pattern in restricted_terms.all_term_patterns:
        if term_pattern.search(normalized_text):
            matched_terms.append(term)

    return matched_terms
