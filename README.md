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

## Локальная разработка на хосте

### Подготовка переменных окружения

```bash
cp .env.example .env
```

Если используете Ollama локально на этой же машине, задайте в `.env`:

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

### Перейти в backend

```bash
cd backend
```

### Запуск backend (uv + FastAPI)

```bash
uv sync --dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Запуск frontend

```bash
cd frontend
npm install
npm start
```


## Адреса локально

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

## [backend] Форматирование и линтинг (ruff)

```bash
uv run ruff format
uv run ruff check --fix
```

## [backend] Запуск тестов
```bash
uv run pytest
```

## Установка новых зависимостей

Backend (runtime)
```bash
uv add <new_lib_name>
```

Backend (dev)
```bash
uv add --dev <new_lib_name>
```

Frontend
```bash
cd ..
cd frontend
npm install <new_lib_name>
```

## Установка Ollama и модели Qwen2.5-VL

```bash
brew install ollama
ollama serve
ollama pull qwen2.5vl
```
