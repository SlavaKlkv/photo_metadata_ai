"""Тесты выбора порта для desktop-точки входа backend."""

from app.desktop_main import DEFAULT_PORT, PORT_ENV_VAR, resolve_port


def test_returns_default_port_without_env(monkeypatch):
    monkeypatch.delenv(PORT_ENV_VAR, raising=False)

    assert resolve_port() == DEFAULT_PORT


def test_returns_port_from_env(monkeypatch):
    monkeypatch.setenv(PORT_ENV_VAR, '8123')

    assert resolve_port() == 8123


def test_falls_back_to_default_on_empty_env(monkeypatch):
    monkeypatch.setenv(PORT_ENV_VAR, '')

    assert resolve_port() == DEFAULT_PORT


def test_falls_back_to_default_on_non_numeric_env(monkeypatch):
    """Опечатка в окружении не должна ронять запуск приложения."""
    monkeypatch.setenv(PORT_ENV_VAR, 'not-a-port')

    assert resolve_port() == DEFAULT_PORT
