import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

# Во frozen-бинарнике (PyInstaller, десктоп-сборка) фронтенд встроен в бандл
# и раздаётся тем же процессом с того же origin. В dev-режиме и под pytest
# `sys.frozen` отсутствует, поэтому монтаж не выполняется.
if getattr(sys, 'frozen', False):
    _frontend_build = Path(getattr(sys, '_MEIPASS', '')) / 'frontend_build'
    if _frontend_build.is_dir():
        app.mount(
            '/',
            StaticFiles(directory=_frontend_build, html=True),
            name='frontend',
        )
