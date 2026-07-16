# Photo Metadata AI — macOS Desktop

Electron-оболочка, упаковывающая FastAPI-бэкенд (PyInstaller, universal2)
и React-фронтенд в одно macOS-приложение (`.app`/`.dmg`).

## Архитектура

- Бэкенд-бинарник сам раздаёт собранный фронтенд (FastAPI `StaticFiles`
  на `/`), Electron просто открывает `http://127.0.0.1:8000` — один
  origin, без CORS.
- Electron управляет только жизненным циклом: запуск бэкенда, ожидание
  health, окно, завершение процесса при выходе.
- Данные пользователя живут вне бандла приложения и переживают
  обновления: `~/Library/Application Support/Photo Metadata AI`
  (задачи, настройки, SQLite) и `~/Documents/Photo Metadata AI/results`.

## Требования

- Node.js 20+
- [uv](https://docs.astral.sh/uv/)
- Xcode Command Line Tools (`lipo`, `sips`, `iconutil`, codesign)
- Rosetta 2 — для x86_64-части universal2-сборки бэкенда:
  `softwareupdate --install-rosetta --agree-to-license`

## Запуск в разработке

```bash
cd desktop && npm install && npm run dev
```

Оболочка сама выбирает способ запуска бэкенда:

1. Упакованное приложение — бинарник из `resources/backend/`.
2. Dev с собранным бинарником — `backend/dist/photo-metadata-backend`,
   если он существует.
3. Dev из исходников — `uv run python -m app.desktop_main`
   (самый быстрый цикл, PyInstaller не нужен).

## Полная сборка

После любых доработок фронтенда или бэкенда свежий `.app`/`.dmg`
со всеми изменениями получается одной командой — скрипт сам пересоберёт
фронтенд, бэкенд-бинарник и приложение:

```bash
desktop/scripts/build-mac.sh
```

Артефакты появляются в `desktop/out/` (`.dmg`, `.zip`,
`mac-universal/Photo Metadata AI.app`).

Скрипт по шагам: сборка фронтенда → PyInstaller arm64 → PyInstaller
x86_64 (через Rosetta, отдельный venv `.venv-x86_64`) → `lipo -create`
в universal2 → копирование в `desktop/resources/backend/` → генерация
`build/icon.icns` из `build/icon.png` (если ещё нет) → electron-builder.

## Дымовой тест бэкенд-бинарника

```bash
uv run --project backend python desktop/scripts/smoke-test.py \
  [путь-к-бинарнику]
```

Проверяет health, раздачу встроенного фронтенда и загрузку JPEG.
При наличии `OPENROUTER_API_KEY` или `GEMINI_API_KEY` в окружении
дополнительно прогоняет process → results → export.

## Дистрибуция (без подписи)

Приложение распространяется неподписанным — учётных данных
Apple Developer нет, подпись и нотаризация не используются
(`identity: null` в `electron-builder.yml`).

При первом открытии скачанного приложения Gatekeeper покажет
предупреждение. Как открыть:

1. Правый клик на `.app` → **Открыть** → в диалоге снова **Открыть**,
   либо
2. Системные настройки → **Конфиденциальность и безопасность** →
   кнопка **Всё равно открыть**, либо
3. в терминале снять карантин-атрибут:
   `xattr -dr com.apple.quarantine "/Applications/Photo Metadata AI.app"`.

### Обновление (ручной flow)

Авто-обновления нет: electron-updater на macOS работает только
с подписанным приложением. Обновление выполняется вручную —
скачать новый `.dmg`, перетащить приложение в `Applications`
поверх старого. Данные пользователя (задачи, настройки, результаты)
живут вне бандла и полностью переживают замену.

Публикация артефактов в GitHub Releases:
`cd desktop && npx electron-builder --mac --publish always`
(нужен `GH_TOKEN`).

## Логи

Вывод бэкенда: `~/Library/Logs/Photo Metadata AI/backend.log`.

## Известные ограничения v1

- Приложение неподписанное: при первом открытии нужен обход
  Gatekeeper (см. «Дистрибуция»), авто-обновление невозможно,
  о новых версиях приложение не уведомляет.
- Порт 8000 фиксирован; второй экземпляр приложения не запустится,
  пока занят порт.
