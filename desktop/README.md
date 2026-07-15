# Photo Metadata AI — macOS Desktop

Electron-оболочка, упаковывающая FastAPI-бэкенд (PyInstaller, universal2)
и React-фронтенд в одно macOS-приложение (`.app`/`.dmg`).

## Архитектура

- Бэкенд-бинарник сам раздаёт собранный фронтенд (FastAPI `StaticFiles`
  на `/`), Electron просто открывает `http://127.0.0.1:8000` — один
  origin, без CORS.
- Electron управляет только жизненным циклом: запуск бэкенда, ожидание
  health, окно, завершение процесса при выходе, авто-обновление.
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

```bash
# неподписанная локальная сборка
CSC_IDENTITY_AUTO_DISCOVERY=false desktop/scripts/build-mac.sh
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

## Подпись и нотаризация

Без переменных окружения ниже electron-builder собирает неподписанное
приложение и пропускает нотаризацию (ошибкой это не является).

| Переменная | Назначение |
| --- | --- |
| `CSC_LINK` | Путь/base64 сертификата Developer ID (.p12) |
| `CSC_KEY_PASSWORD` | Пароль сертификата |
| `CSC_IDENTITY_AUTO_DISCOVERY=false` | Явно отключить подпись (локальные сборки) |
| `APPLE_ID` | Apple ID для нотаризации |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID (используется в `notarize.teamId`) |

Публикация обновлений: `npx electron-builder --mac --publish always`
(нужен `GH_TOKEN`); auto-update читает GitHub Releases репозитория
`SlavaKlkv/photo_metadata_ai`.

## Логи

Вывод бэкенда: `~/Library/Logs/Photo Metadata AI/backend.log`.

## Известные ограничения v1

- Реальная нотаризация ещё не выполнялась; entitlements
  (`build/entitlements.mac.plist`) — best-effort, требуют проверки
  на первой подписанной сборке.
- Порт 8000 фиксирован; второй экземпляр приложения не запустится,
  пока занят порт.
