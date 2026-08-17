import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from app.api.router import router_v1
from app.core.config import settings
from app.core.logging_setup import configure_logging
from app.core.runtime import ensure_runtime_directories
from app.services.desktop.desktop_startup import (
    start_desktop_startup_orchestration,
    stop_desktop_startup_orchestration,
)
from app.services.task_manager import stop_background_task_managers
from app.storage.jobs import storage

configure_logging()


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    ensure_runtime_directories()
    await storage.initialize()
    start_desktop_startup_orchestration()
    try:
        yield
    finally:
        await stop_background_task_managers()
        await stop_desktop_startup_orchestration()


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=app_lifespan,
)

app.include_router(router_v1)

# Настройка CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)


class FrontendStaticFiles(StaticFiles):
    """Статика фронтенда с корректным кешированием.

    `index.html` ссылается на бандлы по хешу имени, поэтому сам он обязан
    приезжать свежим: без явного `Cache-Control` браузер применяет
    эвристическое кеширование и после обновления приложения продолжает
    открывать старую разметку со ссылками на бандлы прежней сборки. Сами
    бандлы, наоборот, неизменяемы — их имя меняется вместе с содержимым.
    """

    def file_response(
        self,
        full_path: Any,
        *args: Any,
        **kwargs: Any,
    ) -> Response:
        response = super().file_response(full_path, *args, **kwargs)
        if str(full_path).endswith('index.html'):
            cache_control = 'no-store, must-revalidate'
        else:
            cache_control = 'public, max-age=31536000, immutable'
        response.headers['Cache-Control'] = cache_control
        return response


def mount_frontend(application: FastAPI, directory: Path) -> None:
    application.mount(
        '/',
        FrontendStaticFiles(directory=directory, html=True),
        name='frontend',
    )


# Во frozen-бинарнике (PyInstaller, десктоп-сборка) фронтенд встроен в бандл
# и раздаётся тем же процессом с того же origin. В dev-режиме и под pytest
# `sys.frozen` отсутствует, поэтому монтаж не выполняется.
if getattr(sys, 'frozen', False):
    _frontend_build = Path(getattr(sys, '_MEIPASS', '')) / 'frontend_build'
    if _frontend_build.is_dir():
        mount_frontend(app, _frontend_build)
