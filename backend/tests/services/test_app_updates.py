import pytest

from app.services.desktop.app_updates import is_newer_version, parse_version


@pytest.mark.parametrize(
    ('value', 'expected'),
    [
        ('1.2.3', (1, 2, 3)),
        ('v1.2.3', (1, 2, 3)),
        (' v10.20.30 ', (10, 20, 30)),
        ('0.0.1', (0, 0, 1)),
    ],
)
def test_parse_version_accepts_semver(value, expected):
    assert parse_version(value) == expected


@pytest.mark.parametrize(
    'value',
    ['1.2', 'abc', '1.2.3-beta', '1.2.3.4', 'vv1.2.3', ''],
)
def test_parse_version_rejects_invalid(value):
    assert parse_version(value) is None


@pytest.mark.parametrize(
    ('latest', 'current', 'expected'),
    [
        ('1.0.1', '1.0.0', True),
        ('1.1.0', '1.0.9', True),
        ('2.0.0', '1.9.9', True),
        ('10.0.0', '9.9.9', True),
        ('1.0.0', '1.0.0', False),
        ('1.0.0', '1.0.1', False),
        ('0.9.9', '1.0.0', False),
    ],
)
def test_is_newer_version_compares_numerically(latest, current, expected):
    assert is_newer_version(latest, current) is expected


@pytest.mark.parametrize(
    ('latest', 'current'),
    [
        ('abc', '1.0.0'),
        ('1.0.0', 'abc'),
        ('', ''),
    ],
)
def test_is_newer_version_is_false_for_unparseable(latest, current):
    assert is_newer_version(latest, current) is False
