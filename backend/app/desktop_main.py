"""Продакшен-точка входа для desktop-сборки backend (PyInstaller).

Не используется в dev-режиме (`uv run uvicorn app.main:app --reload`).
Это frozen-binary путь, также запускаемый из исходников через
`uv run python -m app.desktop_main` для локальной проверки без сборки
PyInstaller.
"""

import uvicorn

from app.main import app


def main() -> None:
    uvicorn.run(
        app,
        host='127.0.0.1',
        port=8000,
        reload=False,
        workers=1,
        log_config=None,
    )


if __name__ == '__main__':
    main()
