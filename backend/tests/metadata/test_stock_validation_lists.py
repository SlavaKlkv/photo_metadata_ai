from app.services.metadata.stock_validation_lists import (
    find_restricted_terms_in_text,
    load_adobe_restricted_terms,
)


def test_load_adobe_restricted_terms_is_cached():
    assert load_adobe_restricted_terms() is load_adobe_restricted_terms()


def test_load_adobe_restricted_terms_dedupes_and_merges_groups():
    terms = load_adobe_restricted_terms()

    assert terms.all_terms
    assert len(set(terms.all_terms)) == len(terms.all_terms)
    assert set(terms.all_terms) == (
        set(terms.brands) | set(terms.person_names) | set(terms.franchises)
    )
    assert len(terms.all_term_patterns) == len(terms.all_terms)


def test_find_restricted_terms_matches_whole_words():
    term = load_adobe_restricted_terms().all_terms[0]

    matched = find_restricted_terms_in_text(f'a photo of {term} on a table')

    assert term in matched


def test_find_restricted_terms_is_case_insensitive():
    term = load_adobe_restricted_terms().all_terms[0]

    assert term in find_restricted_terms_in_text(term.upper())


def test_find_restricted_terms_normalizes_separators():
    term = load_adobe_restricted_terms().all_terms[0]

    assert term in find_restricted_terms_in_text(f'my_{term}_photo')
    assert term in find_restricted_terms_in_text(
        f'my-{term.replace(" ", "-")}-photo'
    )


def test_find_restricted_terms_ignores_substrings_of_longer_tokens():
    term = load_adobe_restricted_terms().all_terms[0]

    assert term not in find_restricted_terms_in_text(f'{term}xyz123')
    assert term not in find_restricted_terms_in_text(f'abc9{term}')


def test_find_restricted_terms_empty_text_returns_empty_list():
    assert find_restricted_terms_in_text('') == []
    assert find_restricted_terms_in_text('   ') == []


def test_find_restricted_terms_clean_text_returns_empty_list():
    assert find_restricted_terms_in_text('пейзаж с горами на закате дня') == []
