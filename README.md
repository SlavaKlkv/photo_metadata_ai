# Photo Metadata AI

Десктопное приложение для macOS, которое готовит фотографии к загрузке на фотостоки:
анализирует каждый кадр с помощью AI и генерирует полный набор метаданных — заголовок,
описание, ключевые слова, категории, тип лицензии, локацию, editorial-подпись и дату,
сведения о людях в кадре и релизах, флаги AI-контента, иллюстрации и mature content.
Метаданные генерируются независимо от площадки, а под выбранный сток пересобираются
уже на этапе проверки и экспорта: приложение вшивает IPTC в файлы и выгружает CSV
в формате Adobe Stock, Shutterstock или Getty Images.

Приложение работает локально: фотографии не покидают компьютер, кроме кадров,
отправляемых выбранному AI-провайдеру. С локальной моделью обработка полностью офлайн.

![Загрузка фотографий](docs/screenshots/04_start_screen.png)

## Возможности

- **Пакетная обработка.** Загрузка сотен фотографий за раз, прогресс с возможностью
  отмены, повтор только упавших файлов.
- **Полный набор метаданных.** AI возвращает не только заголовок и ключевые слова,
  а все поля, которых требуют стоки: категории, лицензию, локацию, editorial-блок,
  людей и релизы, флаги AI-контента и mature content — см. [таблицу ниже](#какие-поля-генерируются).
- **Несколько AI-провайдеров.** Локальная модель Qwen2.5-VL через Ollama, Google Gemini,
  OpenRouter. Провайдеры образуют кольцо fallback: при таймауте, 429 или ошибке файл
  автоматически уходит к следующему, с cooldown и адаптивным ограничением параллельных
  запросов.
- **Правила стоков применяются после генерации.** Модель не знает про площадку —
  ограничения по длине title, числу и составу ключевых слов, словарям категорий,
  типам лицензий и editorial-полям накладываются при маппинге, а автофикс правит то,
  что исправимо автоматически. Смена площадки не требует перегенерации.
- **Проверка перед экспортом.** Таблица результатов, панель Metadata Preview, быстрые
  фильтры и сводка валидации, ручная правка любого поля, перегенерация отдельных файлов.
  Отредактированные вручную поля отмечены подсветкой подписи — видно, что правил человек,
  а что сгенерировал AI; автофикс такие поля не перезаписывает.
- **Экспорт.** CSV под формат выбранного стока + копии фотографий со вшитыми
  IPTC-метаданными; можно выгрузить файлы только со статусами Ready или Without errors.
- **Онбординг и ключи.** Приложение само находит доступные провайдеры, проверяет ключи
  и хранит их в пользовательском каталоге данных, вне бандла приложения.

## Какие поля генерируются

За один проход по кадру AI возвращает platform-agnostic набор полей — намеренно
с запасом, чтобы под конкретный сток их можно было урезать, а не догенерировать:

| Группа | Поля |
| --- | --- |
| Основное | `title` (минимум 5 значимых слов), `description` (минимум одно фактическое предложение), `keywords` (минимум 15 уникальных, по убыванию важности) |
| Классификация | `categories` (1–2 широких кандидата), `license_type` (commercial/editorial), `is_illustration`, `mature_content`, `ai_generated_content_disclosure` |
| Локация | `location` — `sublocation`, `city`, `province_state`, `country` — и читаемая строка `location_metadata`; заполняются только когда место действительно известно |
| Editorial | `is_editorial`, `editorial_caption`, `editorial_date` |
| Люди и права | `has_people`, `people_count`, `model_release_available`, `releases` |

Все текстовые поля — только на английском, как требуют площадки.

### Как набор превращается в формат площадки

Правила стока живут в `services/metadata` и применяются к уже сгенерированным полям:

| Что делает маппинг | Пример |
| --- | --- |
| Урезает title под лимит площадки | Adobe Stock — 70 символов, Getty — 200, Shutterstock — 2048 (предупреждение после 150) |
| Приводит число ключевых слов к диапазону | Adobe Stock — до 49, Getty и Shutterstock — до 50; дубликаты удаляются, порядок по важности сохраняется |
| Переводит категории в словарь площадки | «wildlife» → `Nature` у Getty, `Animals/Wildlife` у Shutterstock, `Animals` у Adobe Stock; Adobe принимает одну категорию, остальные — две |
| Подставляет допустимый тип лицензии | Getty — creative/editorial, Adobe Stock — standard/extended/editorial |
| Собирает свой набор колонок CSV | У Getty есть `Category 2`, `License Type` и `Editorial Date`, у Adobe Stock — `AI Disclosure`, у Shutterstock — `Illustration` и `Mature Content` |

Валидация делит замечания на ошибки и рекомендации, а автофикс чинит формальные:
добивает слишком короткий title, обрезает длинный, приводит число ключевых слов
к границам, убирает дубликаты, подставляет категорию по умолчанию. Поля, которые
вы правили руками, автофикс не трогает.

### Куда записываются метаданные

Поля вшиваются в IPTC экспортированного JPEG, поэтому едут вместе с кадром, а не
живут отдельной таблицей: описание, название, ключевые слова, категория и локация.
Съёмочный EXIF (параметры, ориентация) при этом сохраняется.

## Скриншоты

Проверка и правка метаданных — шаг 4, таблица результатов и панель Metadata Preview:

![Проверка метаданных](docs/screenshots/07_review_metadata_preview.png)

Завершённый экспорт — шаг 5, готовые к загрузке на сток фотографии и CSV:

![Экспорт завершён](docs/screenshots/13_export_completed.png)

Все экраны с описаниями — в [docs/screenshots/](docs/screenshots/README.md).

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
Подробности сборки и релиза — в [`desktop/README.md`](desktop/README.md).

### Стек

| Слой | Технологии |
| --- | --- |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic, aiohttp, httpx, Pillow, structlog, iptcinfo3, uv, Ruff, pytest |
| Frontend | React 18, TypeScript, Zustand, Sass, axios, react-scripts, Jest, Testing Library |
| Desktop | Electron 33, electron-builder, PyInstaller (universal2), Jest |

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

| Что | Адрес |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |

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
