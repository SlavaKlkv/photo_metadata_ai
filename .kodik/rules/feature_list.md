# Список функций (Feature List)

## 1. ЗАГРУЗКА И ОБРАБОТКА ФОТО
- **1.1 Загрузка фотографий (MVP):** Drag & drop зона. Поддержка JPG/PNG. Пакетная загрузка 50+ фото.
- **1.1.1 File validation (MVP):** Проверка формата, размера и целостности файлов перед обработкой. Unsupported/corrupted files помечаются как Error до запуска AI pipeline.
- **1.3 Контекст съёмки = промпт (MVP):** Текстовое поле для описания события (напр. "Wedding, May 2025"). Передаётся в AI.
- **1.4 Выбор AI провайдера (MVP):** Dropdown: Claude (по умолчанию), OpenAI, Ollama. Сохранение выбора в настройках.

## 2. AI АНАЛИЗ ФОТОГРАФИЙ
- **2.1 Анализ изображения через AI (MVP):** Асинхронная отправка фото в Ollama (или Claude/OpenAI Vision) через aiohttp/httpx.
- **2.1.1 Сжатие изображения (MVP):** Возможность сжатия качества до отправки изображения (выбор качества ползунком).
- **2.1.2 Async concurrency limit for AI process (MVP):** Ограничение количества одновременно обрабатываемых изображений через asyncio.Semaphore. Например: 3-5 AI запросов одновременно.
- **2.2 Генерация title и description (MVP):** Title до 70 символов, description до 200 символов. Правила Getty.
- **2.2.1 Генерация keywords (MVP):** До 50 ключевых слов. SEO-оптимизация под стоки.
- **2.2.2 Validation and sanitization of AI metadata (MVP):** Проверка AI-generated metadata: ограничение длины title/description, удаление дубликатов keywords, очистка спецсимволов и переносов строк, валидация структуры ответа AI.
- **2.2.3 Filename sanitization (MVP):** Очистка и нормализация filename: lowercase, replace spaces with underscores, remove unsupported symbols.
- **2.3 Статус обработки (прогресс) (MVP):** Real-time статус каждого файла: Queued -> Processing -> Done / Error.
- **2.3.1 Progress bar на UI (MVP):** Список файлов со статусами. Обновление через polling API (FastAPI backend).
- **2.3.2 Базовая индикация ошибок обработки (MVP):** Упрощенное отображение статуса «Ошибка» для проблемных файлов без детальной расшифровки причин. Логирование системных ошибок только в консоль сервера.

## 3. ПРЕВЬЮ И РЕДАКТИРОВАНИЕ МЕТАДАННЫХ
- **3.1 Превью метаданных (MVP):** Таблица с результатами по каждому файлу: filename, title, keywords, description. Как было и как стало.
- **3.1.1 Таблица Preview All (MVP):** Список всех файлов с результатами. Кнопка Preview All.
- **3.1.2 Редактирование метаданных (MVP):** Inline-редактирование title, keywords, description перед экспортом.

## 4. ЭКСПОРТ РЕЗУЛЬТАТОВ
- **4.1 Экспорт в CSV (MVP):** Генерация CSV файла: filename, title, description, keywords, category. Готов для Getty/Shutterstock/Adobe.
- **4.1.1 FastAPI endpoint GET /export/{job_id} (MVP):** Генерация и скачивание CSV файла.
- **4.1.2 Кнопка Export Results на UI (MVP):** Кнопка запускает скачивание CSV. Индикация успешного скачивания.
- **4.2 Упрощенная встройка метаданных в JPG (MVP):** Реализация базовой записи тегов (Title, Description, Keywords) через библиотеку piexif. Прямое встраивание данных в существующие файлы без изменения структуры изображения и генерация итогового ZIP-архива.
- **4.4 Temporary files cleanup (MVP):** Задача по очистке временных файлов после завершения обработки (кнопка очистить): preview images, temporary exports, ZIP archives, resized images.

## 5. ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ
- **2.3.3 Retry failed files (Доработка):** Повторная обработка только файлов со статусом Error. Без повторного запуска всей batch-задачи.
- **2.3.4 Cancel processing (Доработка):** Возможность остановить batch processing. Новые задачи не запускаются, активные запросы завершаются корректно.
- **5.1 Processing logs (Python logging) (MVP):** Логирование обработки: запуск job, AI provider, ошибки обработки, экспорт файлов, fallback between providers.
- **1.4.1 Local settings persistence (Доработка):** Сохранение пользовательских настроек локально: выбранный AI provider, формат экспорта, последние настройки обработки.
- **5.2 CLI версия (Доработка):** Python CLI приложение на argparse/click/typer.
- **5.3 Job Queue (Bull) (Доработка):** Очередь задач для батч-обработки 300+ фото. asyncio queue / multiprocessing / task manager.