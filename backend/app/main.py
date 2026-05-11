from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router_v1

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
