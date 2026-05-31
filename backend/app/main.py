from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router_v1
from app.core.config import settings
from app.core.logging_setup import configure_logging
from app.core.runtime import ensure_runtime_directories
from app.services.desktop_startup import (
    start_desktop_startup_orchestration,
    stop_desktop_startup_orchestration,
)

configure_logging()


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    ensure_runtime_directories()
    start_desktop_startup_orchestration()
    try:
        yield
    finally:
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
