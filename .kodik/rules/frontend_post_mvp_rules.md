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
- локальный QWEN 2.5 VL через Ollama
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
- character limits
- keywords count
- required fields
- platform-specific fields

Regenerate использует исходные settings batch-а, а не текущие измененные settings.

Бэк генерирует metadata один раз (universal model) и хранит ее как source of truth.
При смене стока AI повторно не запускается: пересчитываются только stock-specific правила.

Что делать на фронте после job completed:

##### 1. Забрать текущее превью:
GET /api/v1/jobs/{job_id}/results

##### 2. Забрать правила/опции для выбранного стока:
GET /api/v1/jobs/stock-options/{stock_platform}

##### 3. Переключить сток без регенерации:
PATCH /api/v1/jobs/{job_id}/settings
{ "stock_platform": "getty_images" }
##### 4. После переключения обязательно повторно запросить:
- GET /api/v1/jobs/{job_id}/results
- GET /api/v1/jobs/stock-options/getty_images

###### 5. В UI строить поля только по stock-options:
- показывать/скрывать поля по флагам (`supports_category_2`, license_required, releases_required, `editorial_*`)
- лимиты и required брать из этого же ответа

###### 6. Ошибки и предупреждения по текущему стоку брать из:
- results[].validation.errors[]
- results[].validation.warnings[]

###### 7. Редактирование строки:
PATCH /api/v1/jobs/{job_id}/files/{file_id}/metadata
Ответ сразу возвращает обновленную строку и повторную валидацию для активного стока.

Ключевое: при смене стока не вызывать /process. Нужен только PATCH settings(stock_platform) + повторный GET results и GET stock-options.

## 8. Export
Поддерживаем только CSV и IPTC.
JSON нужно убрать/не показывать.
Export выбранных файлов:
- перезаписывает IPTC metadata в JPEG
- генерирует CSV под выбранную stock platform
- использует generated filename в export/rename pipeline

Partial re-export под другой stock — ключевая фича.
После первого export пользователь может поменять Stock platform в Settings и сделать re-export без новой AI generation.
Backend/frontend должны использовать уже сгенерированный полный metadata set и только поменять projection/export format.

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