"""Продакшен-точка входа для desktop-сборки backend (PyInstaller).

Не используется в dev-режиме (`uv run uvicorn app.main:app --reload`).
Это frozen-binary путь, также запускаемый из исходников через
`uv run python -m app.desktop_main` для локальной проверки без сборки
PyInstaller.
"""

import os

import uvicorn

from app.main import app

DEFAULT_PORT = 8000
PORT_ENV_VAR = 'PHOTO_METADATA_BACKEND_PORT'


def resolve_port() -> int:
    """Порт backend: из окружения, иначе штатный 8000.

    Переопределение нужно дымовому тесту (desktop/scripts/smoke-test.py):
    он поднимает собственный экземпляр backend и на порту по умолчанию
    конфликтовал бы с уже запущенным приложением.
    """
    raw = os.environ.get(PORT_ENV_VAR)
    if not raw:
        return DEFAULT_PORT
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_PORT


def main() -> None:
    uvicorn.run(
        app,
        host='127.0.0.1',
        port=resolve_port(),
        reload=False,
        workers=1,
        log_config=None,
    )


if __name__ == '__main__':
    main()
