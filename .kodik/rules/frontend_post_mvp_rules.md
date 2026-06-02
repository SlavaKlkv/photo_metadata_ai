Мы работаем над проектом Photo Metadata AI.

Контекст проекта:
- Сейчас идет перенос существующей web-версии в desktop macOS app.
- Цель продукта: desktop app для подготовки фотографий к загрузке на stock platforms.
- Я frontend developer. В команде также есть backend developer и UX/UI designer.
- Код менять нельзя; сначала нужно читать текущий код и предлагать решения аккуратно по существующим паттернам проекта.
- Работа ведется по feature list и Git Project.

Важно:
- Desktop app для frontend сейчас можно разрабатывать через web/dev-режим.
- Desktop-specific действия должны быть спрятаны за service/integration layer, чтобы позже подключить backend/app shell.
- Не нужно делать fork. Если нужна отдельная работа, можно создать отдельную git branch в этом же проекте.
- Перед изменениями сначала изучи структуру проекта и текущее состояние кода.

Продуктовая логика:

## 1. App initialization
При запуске приложение сканирует окружение на доступные AI-провайдеры:
- локальный QWEN 2.5 VL (на этапе разработки можно через Ollama или mock)
- Open Router
- Gemini

Если найден один провайдер, он выбирается автоматически с уведомлением.
Если найдено несколько, пользователь выбирает через dropdown.
Если ни одного, приложение показывает onboarding/instructions и блокирует дальнейшую работу.
Статус соединения должен постоянно отображаться в header/body согласно app-дизайну.

## 2. Context & Settings
Перед processing пользователь настраивает batch/session.
Shooting context обязателен.
Поля:
- Shooting context: свободный текст, передается в prompt вместе с изображением.
- Stock platform: Getty, Shutterstock, Adobe Stock, Alamy и другие.
- AI provider: один из обнаруженных providers.
- Image compression: пользовательский slider нужно убрать. По умолчанию использовать программное сжатие до 1800px по длинной стороне, если это нужно provider config.

Settings сохраняются между сессиями, но Start new batch должен сбрасывать состояние batch. Нужно быть внимательным к различию между persisted defaults и текущим batch state.

## 3. Stock platform logic
AI генерирует metadata один раз и максимально полно: все возможные поля, которые backend умеет получить.
Выбранная stock platform НЕ должна требовать новой AI generation.
Stock platform определяет только:
- какие поля показывать в Metadata Preview
- какие лимиты и validation rules применять
- как формировать CSV
- какие platform-specific поля показывать при re-export

Backend отвечает за полный metadata set и stock-specific projection/schema.
Frontend должен уметь показывать только нужные поля выбранного stock.

## 4. Upload Photos
Пользователь выбирает папку или файлы.
App рекурсивно сканирует содержимое.
Работаем только с JPEG:
- .jpg
- .jpeg
- JPG
- JPEG
- желательно MIME/signature validation, если доступно

Другие форматы игнорируются.
Повторная загрузка уже обработанных файлов не имеет special handling: они обрабатываются заново.
После добавления файлов и заполнения Shooting context активируется Start Processing.

## 5. Processing
Processing запускается кнопкой Start Processing.
Во время processing показывается блокирующая modal.
Нельзя редактировать результаты во время processing.
Modal нельзя закрыть как обычное окно; закрытие только через Cancel.
Cancel сбрасывает processing.
Processing может быть sequential, но архитектурно не стоит жестко блокировать будущую bounded concurrency.

Для каждого файла:
- изображение опционально сжимается
- формируется prompt: stock instruction + shooting context + image
- AI возвращает structured metadata
- результат сохраняется в state приложения

AI по умолчанию всегда генерирует metadata на английском.

## 6. Results
После processing появляется Results table:
- thumbnail
- original filename
- generated filename
- checkbox для batch selection

Generated filename реально участвует в rename/export pipeline, это не только display field.
При выборе файла в Results справа обновляется Metadata Preview.

## 7. Metadata Preview

Показывает metadata выбранного файла.

Поля зависят от выбранной Stock platform.
Все видимые поля редактируемые.

Нужны counters/validation по правилам выбранного stock:

* character limits
* keywords count
* required fields
* platform-specific fields

Regenerate использует исходные settings batch-а, а не текущие измененные settings.

Бэк генерирует metadata один раз (universal model) и хранит ее как source of truth.

При смене стока AI повторно не запускается: пересчитываются только stock-specific правила и preview.

### Структура results[]

В results[] приходят:

* selected_for_export
* field_sources (`generated` / `edited`)
* edited_fields
* preview:

  * common_fields
  * stock_specific.fields
  * errors[]
  * warnings[]

Ошибки и предупреждения отображаются в UI до export.

### Что делать на фронте после job completed

#### 1. Забрать текущее превью

```http
GET /api/v1/jobs/{job_id}/results
```

#### 2. Забрать правила и опции выбранного стока

```http
GET /api/v1/jobs/stock-options/{stock_platform}
```

#### 3. Переключить preview под другой stock без регенерации

```http
GET /api/v1/jobs/{job_id}/results?stock_platform=getty_images
```

Поддерживаемые платформы:

* shutterstock
* getty_images
* adobe_stock

Этот запрос меняет только отображение preview.
AI повторно не запускается.

#### 4. После смены preview повторно запросить stock options

```http
GET /api/v1/jobs/stock-options/getty_images
```

#### 5. В UI строить поля только по stock-options

* показывать/скрывать поля по флагам (`supports_category_2`, `license_required`, `releases_required`, `editorial_*`)
* лимиты и required брать из stock-options
* common_fields отображать всегда
* stock_specific.fields отображать согласно выбранному stock

#### 6. Ошибки и предупреждения

Брать из:

```text
results[].preview.errors[]
results[].preview.warnings[]
```

#### 7. Редактирование metadata

```http
PATCH /api/v1/jobs/{job_id}/files/{file_id}/metadata
```

Отправлять только измененные поля.

Включая:

```json
{
  "selected_for_export": true
}
```

или любые измененные metadata fields.

Использовать field_sources и edited_fields для отображения измененных пользователем полей.

#### 8. Включение/исключение файла из export

Использовать:

```http
PATCH /api/v1/jobs/{job_id}/files/{file_id}/metadata
```

с изменением:

```json
{
  "selected_for_export": false
}
```

В export попадают только файлы:

* selected_for_export = true
* status = completed

### Важно

Переключение stock через:

```http
GET /api/v1/jobs/{job_id}/results?stock_platform=...
```

меняет только preview.

Чтобы реально сменить stock platform для export, необходимо:

```http
PATCH /api/v1/jobs/{job_id}/settings
```

```json
{
  "stock_platform": "adobe_stock"
}
```

После этого запускать export.

Ключевое: при смене stock platform не вызывать повторный processing. Используется уже существующий universal metadata set, а backend строит новый stock-specific preview и export projection.

## 8. Export

Поддерживаем только CSV и IPTC.

JSON нужно убрать и не показывать в UI.

Export использует уже существующий universal metadata set.
Новая AI generation для export или re-export не требуется.

В export попадают только файлы, которые одновременно соответствуют условиям:

* selected_for_export = true
* status = completed

### Перед export

Текущий stock platform для export должен быть сохранен через:

```http
PATCH /api/v1/jobs/{job_id}/settings
```

```json
{
  "stock_platform": "adobe_stock"
}
```

или другую поддерживаемую платформу.

Важно:

```http
GET /api/v1/jobs/{job_id}/results?stock_platform=...
```

влияет только на preview и не меняет платформу экспорта.

### Запуск export

CSV:

```http
POST /api/v1/jobs/{job_id}/export?csv=true
```

IPTC:

```http
POST /api/v1/jobs/{job_id}/export?iptc=true
```

CSV + IPTC одновременно:

```http
POST /api/v1/jobs/{job_id}/export?csv=true&iptc=true
```

### Что делает export

Для выбранных файлов export:

* перезаписывает IPTC metadata в JPEG (если включен `iptc=true`)
* генерирует CSV под активную stock platform (если включен `csv=true`)
* использует generated filename в export/rename pipeline
* использует только файлы с `selected_for_export=true`

### Re-export под другой stock

Partial re-export под другой stock является ключевой функцией продукта.

После первого export пользователь может:

1. Изменить Stock platform.
2. Сохранить новый stock через:

```http
PATCH /api/v1/jobs/{job_id}/settings
```

3. Выполнить export повторно.

При этом:

* AI не запускается повторно
* metadata не генерируется заново
* backend использует существующий universal metadata set
* меняются только stock-specific projection, validation и export format

Frontend не должен вызывать processing или regenerate для сценария re-export.


## 9. Post-export / Success Modal
Для desktop после export нужно четыре кнопки:
- Back to results
- Start new batch
- Open CSV file
- Open folder

Open CSV file и Open folder — реальные desktop scenarios, не заглушки.
Позже может появиться Open stock website.

## 10. UI/design context
Есть дизайн-макеты состояний:
- empty
- uploaded
- processing
- review
- export
- success

Визуальный стиль: dark desktop app UI, похожий на macOS utility app.
Header/Footer нужно перенести в body согласно app-дизайну.
Не надо делать landing page; это рабочий tool interface.

Post-MVP feature list:
- перенос web app в desktop macOS app
- AI always generates English metadata
- open/close lifecycle для desktop macOS приложения
- integrations and testing
- Header/Footer перенос в body согласно app design
- AI provider selector: QWEN 2.5 VL, Open Router, Gemini
- onboarding modal + environment scan for providers
- remove compression slider, use 1800px long side programmatically
- JPEG-only upload validation
- stock-specific metadata fields
- stock-specific metadata validation
- success modal with Back to results, Start new batch, Open CSV file, Open folder
- only CSV and IPTC export options

Suggested task priorities:
1. Read current codebase structure.
2. Identify frontend framework, state management, routing, UI components, existing mock/backend service patterns.
3. Do not modify files until current architecture is understood.
4. Propose a branch name with prefix codex/, for example codex/desktop-migration-planning or codex/app-port-mvp.
5. Start with frontend tasks that can be done without backend:
   - move Header/Footer controls into body according to app design
   - remove JSON export option
   - remove compression slider from UI
   - add JPEG-only validation in upload flow
   - add stock-specific field rendering structure
   - add stock-specific validation structure
   - update success modal actions
   - clarify batch state model

Working style:
- First inspect files with rg/ls/sed.
- Preserve existing code style and project patterns.
- Do not rewrite architecture unless necessary.
- Keep changes small and tied to Git Project tasks.
- If backend is missing, use mock service layer / adapter pattern.
- Separate UI from app/desktop integration calls.
- Explain each change briefly and verify with available tests/build/lint.