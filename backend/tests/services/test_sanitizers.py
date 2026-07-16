from app.utils.sanitizers import (
    sanitize_filename,
    sanitize_keywords,
    sanitize_metadata_text,
    sanitize_string_list,
)


def test_sanitize_filename_normalizes_stem():
    assert sanitize_filename('My Photo 01.JPG') == 'my_photo_01'


def test_sanitize_filename_collapses_whitespace_and_underscores():
    assert sanitize_filename('  spaced   name .jpeg') == 'spaced_name'


def test_sanitize_filename_removes_unsafe_characters():
    assert sanitize_filename('a.b!@#$.c.jpg') == 'abc'


def test_sanitize_filename_falls_back_for_empty_stem():
    assert sanitize_filename('привет мир!.jpg') == 'uploaded_file'
    assert sanitize_filename('!!!.jpg') == 'uploaded_file'


def test_sanitize_metadata_text_none_passthrough():
    assert sanitize_metadata_text(None) is None


def test_sanitize_metadata_text_collapses_inner_whitespace():
    assert sanitize_metadata_text('  a \t  b\n c ') == 'a b c'


def test_sanitize_metadata_text_blank_becomes_none():
    assert sanitize_metadata_text('   ') is None


def test_sanitize_keywords_none_returns_empty_list():
    assert sanitize_keywords(None) == []


def test_sanitize_keywords_lowercases_and_dedupes_in_order():
    assert sanitize_keywords(['Sky', 'sky ', 'SKY', 'Blue  Sky']) == [
        'sky',
        'blue sky',
    ]


def test_sanitize_keywords_drops_empty_entries():
    assert sanitize_keywords(['', '  ', 'sunset']) == ['sunset']


def test_sanitize_string_list_none_returns_empty_list():
    assert sanitize_string_list(None) == []


def test_sanitize_string_list_keeps_original_case_dedupes_case_insensitive():
    assert sanitize_string_list(['Alpha', 'alpha', ' Beta  x ']) == [
        'Alpha',
        'Beta x',
    ]


def test_sanitize_string_list_drops_empty_entries():
    assert sanitize_string_list(['', '  ', 'Value']) == ['Value']
