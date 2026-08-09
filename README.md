Photo Metadata AI — приложение для macOS, генерирующее метаданные для фотостоков

# Photo Metadata AI

Десктопное приложение для macOS, которое готовит фотографии к загрузке на фотостоки:
анализирует каждый кадр с помощью AI, генерирует полный набор метаданных, пересобирает
их под выбранную площадку (Adobe Stock, Shutterstock, Getty Images), вшивает IPTC
в файлы и выгружает CSV.

Обзор продукта, возможности, состав полей и скриншоты — на странице проекта:  
**[https://slavaklkv.github.io/photo_metadata_ai/landing/](https://slavaklkv.github.io/photo_metadata_ai/landing/)**  
все экраны приложения — на [/landing/screens.html](https://slavaklkv.github.io/photo_metadata_ai/landing/screens.html),  
исходники страницы — в [docs/landing/](docs/landing/)  
(переключатели эффектов — [docs/landing/README.md](docs/landing/README.md)).  
Здесь — то, что нужно для работы с кодом.

Приложение работает локально: фотографии не покидают компьютер, кроме кадров,
отправляемых выбранному AI-провайдеру. С локальной моделью обработка полностью офлайн.

## Установка

1. Скачайте `.dmg` из [Releases](https://github.com/SlavaKlkv/photo_metadata_ai/releases).
2. Откройте образ и перетащите **Photo Metadata AI.app** в `Applications`.
3. При первом запуске приложение проведёт через AI Setup: подключение локальной Ollama
  и/или ввод ключей Gemini и OpenRouter.

Сборка universal2 — работает и на Apple Silicon, и на Intel.

Приложение проверяет опубликованные GitHub Releases и сообщает о новой версии баннером.
Загрузка и установка ручные: `.dmg` открывается в системном браузере, приложение
заменяется в `Applications`. Пользовательские данные хранятся вне бандла
(`~/Library/Application Support/Photo Metadata AI`, `~/Documents/Photo Metadata AI/results`)
и переживают обновление.

### Локальная модель (опционально)

```bash
brew install ollama
ollama serve
ollama pull qwen2.5vl
```



## Как это устроено

```
Electron (desktop/)
  └─ запускает бинарник бэкенда и открывает http://127.0.0.1:8000
       └─ FastAPI (backend/) — API + раздача собранного React-фронтенда
            ├─ services/ai         — провайдеры, fallback, throttling
            ├─ services/metadata   — правила стоков, валидация, автофикс, вшивание IPTC
            └─ services/export     — CSV и выгрузка файлов
React + TypeScript (frontend/) — мастер из пяти шагов: Upload → Context → Process → Review → Export
```

Бэкенд сам раздаёт фронтенд, поэтому в собранном приложении один origin и нет CORS.
Подробности сборки и релиза — в `[desktop/README.md](desktop/README.md)`.

Ключевое архитектурное решение: AI возвращает platform-agnostic набор полей, а правила
конкретного стока (лимиты title, число и словари ключевых слов и категорий, типы лицензий,
editorial-поля, состав колонок CSV) применяются позже, в `services/metadata`. Поэтому смена
площадки не требует перегенерации, а автофикс правит только формальные нарушения и не
трогает поля, отредактированные вручную.

### Контракт метаданных

За один проход по кадру AI возвращает platform-agnostic набор полей — намеренно
с запасом, чтобы под конкретный сток их можно было урезать, а не догенерировать.
Все текстовые поля — только на английском, как требуют площадки.


| Группа        | Поля                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Основное      | `title` (минимум 5 значимых слов), `description` (минимум одно фактическое предложение), `keywords` (минимум 15 уникальных, по убыванию важности)              |
| Классификация | `categories` (1–2 широких кандидата), `license_type` (commercial/editorial), `is_illustration`, `mature_content`, `ai_generated_content_disclosure`            |
| Локация       | `location` — `sublocation`, `city`, `province_state`, `country` — и читаемая строка `location_metadata`; заполняются только когда место действительно известно |
| Editorial     | `is_editorial`, `editorial_caption`, `editorial_date`                                                                                                          |
| Люди и права  | `has_people`, `people_count`, `model_release_available`, `releases`                                                                                            |




### Правила площадок

Живут в `services/metadata` и применяются к уже сгенерированным полям:


| Что делает маппинг                       | Значения                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Урезает title под лимит площадки         | Adobe Stock — 70 символов, Getty — 200, Shutterstock — 2048 (предупреждение после 150)                                                            |
| Приводит число ключевых слов к диапазону | Adobe Stock — до 49, Getty и Shutterstock — до 50; дубликаты удаляются, порядок по важности сохраняется                                           |
| Переводит категории в словарь площадки   | «wildlife» → `Nature` у Getty, `Animals/Wildlife` у Shutterstock, `Animals` у Adobe Stock; Adobe принимает одну категорию, остальные — две        |
| Подставляет допустимый тип лицензии      | Getty — creative/editorial, Adobe Stock — standard/extended/editorial, Shutterstock — commercial/editorial                                        |
| Собирает свой набор колонок CSV          | У Getty есть `Category 2`, `License Type` и `Editorial Date`, у Adobe Stock — `AI Disclosure`, у Shutterstock — `Illustration` и `Mature Content` |


Валидация делит замечания на ошибки и рекомендации, а автофикс чинит формальные:
добивает слишком короткий title, обрезает длинный, приводит число ключевых слов
к границам, убирает дубликаты, подставляет категорию по умолчанию. Поля,
отредактированные вручную, помечаются подсветкой подписи, и автофикс их не перезаписывает.

При экспорте поля вшиваются в IPTC самого JPEG (описание, название, ключевые слова,
категория, локация), поэтому едут вместе с кадром, а не живут отдельной таблицей.
Съёмочный EXIF при этом сохраняется. Выгрузить можно весь пакет, только файлы
со статусом Ready или все без ошибок.

### Провайдеры

Локальная модель Qwen2.5-VL через Ollama, Google Gemini, OpenRouter. Провайдеры
образуют кольцо fallback: при таймауте, 429 или ошибке файл автоматически уходит
к следующему — с cooldown и адаптивным ограничением параллельных запросов. Ключи
проверяются на онбординге и хранятся в пользовательском каталоге данных, вне бандла.

### Стек


| Слой     | Технологии                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Backend  | Python 3.11+, FastAPI, Uvicorn, Pydantic, aiohttp, httpx, Pillow, structlog, iptcinfo3, uv, Ruff, pytest |
| Frontend | React 18, TypeScript, Zustand, Sass, axios, react-scripts, Jest, Testing Library                         |
| Desktop  | Electron 33, electron-builder, PyInstaller (universal2), Jest                                            |




## Разработка



### Переменные окружения

```bash
cp .env.example .env
```

Для локальной Ollama на этой же машине:

```bash
OLLAMA_BASE_URL=http://localhost:11434
```



### Backend

```bash
cd backend
uv sync --dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```



### Frontend

```bash
cd frontend
npm install
npm start
```



### Desktop

```bash
cd desktop
npm install
npm run dev
```



### Адреса


| Что        | Адрес                                                      |
| ---------- | ---------------------------------------------------------- |
| Frontend   | [http://localhost:3000](http://localhost:3000)             |
| Backend    | [http://localhost:8000](http://localhost:8000)             |
| Swagger UI | [http://localhost:8000/docs](http://localhost:8000/docs)   |
| ReDoc      | [http://localhost:8000/redoc](http://localhost:8000/redoc) |




## Проверки

Линтинг и форматирование бэкенда:

```bash
cd backend
uv run ruff format
uv run ruff check --fix
```

Тесты с покрытием:

```bash
cd backend   && uv run pytest --cov=app --cov-report=term-missing
cd frontend  && npm test -- --coverage --runInBand
cd desktop   && npm test -- --coverage
```

Production-сборка фронтенда:

```bash
cd frontend && npm run build
```

Полная сборка macOS-приложения — `.app` и `.dmg` появятся в `desktop/out/`:

```bash
desktop/scripts/build-mac.sh
```



### Новые зависимости

```bash
cd backend  && uv add <lib>          # runtime
cd backend  && uv add --dev <lib>    # dev
cd frontend && npm install <lib>
```



## Релизы

Релиз собирается GitHub Actions по тегу `v*`: срезы бэкенда собираются нативно на
arm64 и x86_64, склеиваются в universal2, затем упаковываются в `.dmg` и публикуются
в Releases.

Приложение подписывается ad-hoc: учётных данных Apple Developer нет, поэтому
нотаризации не будет и при первом запуске macOS покажет предупреждение о
неизвестном разработчике — открывается через правый клик по приложению → «Открыть».
Без подписи вовсе macOS считала скачанный бандл повреждённым и не давала открыть
его из Finder совсем, поэтому ad-hoc здесь не косметика.

## Лицензия

MIT