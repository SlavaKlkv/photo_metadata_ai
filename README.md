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

## Проверки

### Backend: форматирование и линтинг (ruff)

```bash
cd backend
uv run ruff format
uv run ruff check --fix
```

### Frontend: production-сборка

```bash
cd frontend
npm run build
```

### Desktop: полная сборка macOS-приложения

```bash
cd desktop
./scripts/build-mac.sh
```

Готовые `.app` и `.dmg` будут сохранены в `desktop/out/`.

Desktop-приложение проверяет опубликованные GitHub Releases и сообщает
о новой версии баннером. Загрузка и установка остаются ручными:
пользователь открывает `.dmg` в системном браузере и заменяет приложение
в `Applications`; пользовательские данные хранятся вне бандла и
сохраняются при обновлении. Инструкции по сборке и публикации релиза —
в [`desktop/README.md`](desktop/README.md).

### Тесты с проверкой покрытия

#### Backend

```bash
cd backend
uv run pytest --cov=app --cov-report=term-missing
```

#### Frontend

```bash
cd frontend
npm test -- --coverage --runInBand
```

#### Desktop

```bash
cd desktop
npm test -- --coverage
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
