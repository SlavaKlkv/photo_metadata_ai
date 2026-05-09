FROM python:3.11-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Установка uv для управления зависимостями
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Копируем файлы зависимостей
COPY pyproject.toml ./
RUN uv sync --all-groups

# Копируем исходный код
COPY . .

# Создаем директории для временных файлов
RUN mkdir -p /app/temp_uploads /app/temp_exports

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
