# Photo Metadata AI

AI-сервис для автоматической обработки фотографий: анализ изображений, генерация метаданных, переименование файлов и экспорт информации в CSV.

Проект предназначен для фотографов, которые продают фотографии на стоках. Пользователь загружает папку с фотографиями, сервис анализирует каждое изображение с помощью AI, генерирует название, описание и ключевые слова, после чего подготавливает данные для загрузки на Getty, Shutterstock и Adobe Stock.

## Стек

### Backend

- Python
- FastAPI
- Uvicorn
- uv
- Ruff

### Frontend

- React
- TypeScript
- npm
- react-scripts

### Инфраструктура

- Docker
- Docker Compose

## Старт локальной разработки в Docker

### Создание файла с переменными окружения

```bash
cp  .env.example  .env
```

### Запуск сервисов

```bash
docker compose up -d
```

## Адреса

Frontend

```text
http://localhost:3000
```

Backend

```text
http://localhost:8000
```

Swagger UI

```text
http://localhost:8000/docs
```

ReDoc

```text
http://localhost:8000/redoc
```

## [ backend ] Форматирование кода и проверка с автоисправлением

```bash
docker compose run --rm backend uv run ruff format
docker compose run --rm backend uv run ruff check --fix
```

## Перезапуск проекта с пересборкой без кеша

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

## Установка новых зависимостей

Backend
```bash
docker compose run --rm backend uv add <new_lib_name>
```

Frontend
```bash
docker compose run --rm --no-deps frontend npm install <new_lib_name>
```

## Установка Ollama и модели llava
```bash
brew install ollama
ollama serve
ollama pull llava
```
