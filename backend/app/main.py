from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.jobs import router as jobs_router

app = FastAPI()

app.include_router(jobs_router)

# Настройка CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
