from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router_v1
from app.core import logging_setup  # noqa: F401

# Импорт logging_setup выше инициализирует structlog при старте приложения.
app = FastAPI()

app.include_router(router_v1)

# Настройка CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
