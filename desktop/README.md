# Photo Metadata AI — macOS Desktop

Electron-оболочка, упаковывающая FastAPI-бэкенд (PyInstaller, срезы
arm64 и x86_64) и React-фронтенд в одно universal macOS-приложение
(`.app`/`.dmg`).

## Архитектура

- Бэкенд-бинарник сам раздаёт собранный фронтенд (FastAPI `StaticFiles`
  на `/`), Electron просто открывает `http://localhost:8000` — один
  origin, без CORS.
- Electron управляет только жизненным циклом: запуск бэкенда, ожидание
  health, окно, завершение процесса при выходе.
- Срезы backend лежат раздельно (`resources/backend/{arm64,x86_64}/`) —
  нужный выбирается в рантайме по `process.arch`. Склейка через `lipo`
  невозможна: PyInstaller onefile хранит Python/dylib overlay в конце
  файла, а `lipo` сохраняет только один overlay.
- Данные пользователя живут вне бандла приложения и переживают
  обновления: `~/Library/Application Support/Photo Metadata AI`
  (задачи, настройки, SQLite) и `~/Documents/Photo Metadata AI/results`.

## Требования

- Node.js 20 LTS (та же версия используется в release workflow)
- [uv](https://docs.astral.sh/uv/)
- Xcode Command Line Tools (`lipo` для проверки срезов, codesign)
- Rosetta 2 — для локальной x86_64-сборки бэкенда на Apple Silicon:
  `softwareupdate --install-rosetta --agree-to-license`

## Запуск в разработке

```bash
cd desktop && npm install && npm run dev
```

Оболочка сама выбирает способ запуска бэкенда:

1. Упакованное приложение — бинарник из `resources/backend/<arch>/`.
2. Dev с собранным бинарником — `backend/dist/photo-metadata-backend`,
   если он существует.
3. Dev из исходников — `uv run python -m app.desktop_main`
   (самый быстрый цикл, PyInstaller не нужен).

## Полная сборка

После любых доработок фронтенда или бэкенда свежий `.app`/`.dmg`
со всеми изменениями получается одной командой — скрипт сам пересоберёт
фронтенд, бэкенд-бинарники и приложение:

```bash
desktop/scripts/build-mac.sh
```

Артефакты появляются в `desktop/out/` (`.dmg`, `.zip`,
`mac-universal/Photo Metadata AI.app`).

Скрипт по шагам: сборка фронтенда → PyInstaller arm64 → PyInstaller
x86_64 (через Rosetta, отдельный venv `.venv-x86_64`) → дымовой тест
обоих срезов → копирование в `desktop/resources/backend/{arm64,x86_64}/`
→ electron-builder (universal). Исходный `build/icon.png` 1024×1024
конвертируется в ICNS средствами electron-builder.

Частичный запуск (как в release workflow):

- `--backend-only=arm64|x86_64` — только фронтенд + backend этого среза
  (нативно, хост должен совпадать с целевой архитектурой);
- `--app-only` — только electron-builder; ожидает готовые оба среза
  в `resources/backend/`.

## Дымовой тест бэкенд-бинарника

```bash
uv run --project backend python desktop/scripts/smoke-test.py \
  [путь-к-бинарнику]
```

Проверяет health, раздачу встроенного фронтенда и загрузку JPEG.
При наличии `OPENROUTER_API_KEY` или `GEMINI_API_KEY` в окружении
дополнительно прогоняет process → results → export.

## Дистрибуция (ad-hoc подпись)

Учётных данных Apple Developer нет, поэтому полноценная Developer ID
подпись и нотаризация не используются. Бандл всё же **подписан
ad-hoc** (`identity: '-'` в `electron-builder.yml`):

- без какой-либо подписи macOS на чужой машине с флагом quarantine
  показывала «приложение повреждено» и не давала открыть его из GUI;
- ad-hoc запечатывает Info.plist и ресурсы — остаётся обычное
  предупреждение неизвестного разработчика с обходом через GUI;
- `hardenedRuntime` выключен: вместе с library validation ad-hoc
  .dylib внутри PyInstaller-бинарника backend не проходят проверку,
  и приложение падало бы на старте.

При первом открытии скачанного приложения Gatekeeper покажет
предупреждение. Как открыть:

1. Правый клик на `.app` → **Открыть** → в диалоге снова **Открыть**,
   либо
2. Системные настройки → **Конфиденциальность и безопасность** →
   кнопка **Всё равно открыть**, либо
3. в терминале снять карантин-атрибут:
   `xattr -dr com.apple.quarantine "/Applications/Photo Metadata AI.app"`.

### Обновление (ручной flow)

Авто-установки обновлений нет: electron-updater на macOS рассчитан
на Developer ID / нотаризированный дистрибутив; ad-hoc для этого
недостаточно. При появлении новой опубликованной версии приложение
показывает сверху ненавязчивый баннер. Кнопка **Download** открывает
`.dmg` из GitHub Releases в системном браузере, а **Dismiss** скрывает
уведомление именно для этой версии.

В нативном меню **Photo Metadata AI** всегда доступен пункт
**Check for Updates…**. Ручная проверка запрашивает свежие данные
и показывает системный диалог: **You're using the latest version**
либо номер доступной версии с кнопкой **Download**. Скрытие баннера
не отключает ручную проверку.

Установка остаётся ручной: скачать новый `.dmg` и перетащить приложение
в `Applications` поверх старого. Данные пользователя (задачи,
настройки, результаты) живут вне бандла и полностью переживают замену.

Источник версии desktop-приложения — `desktop/package.json`. Версии
frontend и backend внутренние и не синхронизируются с версией релиза.

### Публикация новой версии

1. Изменить `version` в `desktop/package.json` и закоммитить изменение.
2. Создать совпадающий тег и отправить его:
   `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. GitHub Actions соберёт universal `.dmg` и `.zip` и загрузит их
   в draft-релиз.
4. Проверить draft-релиз и опубликовать его вручную.

Draft-релизы не участвуют в проверке обновлений. Баннер появится у
пользователей только после ручной публикации релиза.

## Логи

Вывод бэкенда: `~/Library/Logs/Photo Metadata AI/backend.log`.

## Известные ограничения v1

- Ad-hoc подпись, без нотаризации: при первом открытии нужен обход
  Gatekeeper (см. «Дистрибуция»), автоматическая установка обновлений
  невозможна.
- Порт 8000 фиксирован; второй экземпляр приложения не запустится,
  пока занят порт (single-instance lock фокусирует уже открытое окно).
