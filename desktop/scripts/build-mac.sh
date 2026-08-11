#!/usr/bin/env bash
# Полная сборка macOS-приложения Photo Metadata AI (.app/.dmg).
#
# Этапы:
#   1. Сборка фронтенда (frontend/build) — встраивается в бинарник backend.
#   2. Backend PyInstaller: arm64 нативно.
#   3. electron-builder --mac (arm64) -> desktop/out/.
#      Иконка build/icon.png конвертируется штатными средствами electron-builder.
#
# Приложение собирается только под Apple Silicon. Intel-срез убран
# осознанно: macOS 26 Tahoe — последняя версия macOS для Intel-маков,
# новых Intel-машин нет с 2020 года, а GitHub Actions сворачивает
# x86_64-раннеры в 2027-м. Поддерживать вторую архитектуру ради
# уходящей платформы дороже, чем она стоит: universal2 удваивал вес
# бэкенда в бандле и требовал отдельного нативного раннера.
#
# Частичный запуск (используется .github/workflows/release.yml):
#   --backend-only=arm64  только фронтенд + backend. Собирает нативно и
#                         требует, чтобы хост был Apple Silicon.
#   --app-only            только electron-builder; ожидает готовый
#                         resources/backend/arm64/.
#
# Подпись — ad-hoc (identity: '-' в electron-builder.yml). Учётных
# данных Apple Developer нет; Developer ID / нотаризация не включаются
# через CSC_* / APPLE_* — для них нужно сменить identity и
# hardenedRuntime в yml (см. desktop/README.md).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
DESKTOP_DIR="$PROJECT_ROOT/desktop"
SPEC="desktop_build/photo_metadata_backend.spec"
SMOKE_TEST="$PROJECT_ROOT/desktop/scripts/smoke-test.py"

BACKEND_ONLY=""
APP_ONLY=""
PUBLISH=""
BUILDER_ARGS=()
for arg in "$@"; do
  case "$arg" in
    # Публикацию electron-builder не выполняет: он заливает артефакты
    # прямо из упаковки, то есть до ad-hoc подписи DMG и до пересчёта
    # latest-mac.yml. Так в релиз v1.1.0 и уехал неподписанный образ,
    # который не открывался из браузера. Флаг перехватываем и грузим
    # артефакты сами — после подписи.
    --publish=*)
      PUBLISH="${arg#--publish=}"
      ;;
    --publish)
      PUBLISH="pending-value"
      ;;
    always | onTag | onTagOrDraft | never)
      if [[ "$PUBLISH" == "pending-value" ]]; then
        PUBLISH="$arg"
      else
        BUILDER_ARGS+=("$arg")
      fi
      ;;
    --backend-only=*)
      BACKEND_ONLY="${arg#--backend-only=}"
      if [[ "$BACKEND_ONLY" != "arm64" ]]; then
        echo "ОШИБКА: --backend-only ожидает arm64, получено '$BACKEND_ONLY'" >&2
        exit 1
      fi
      ;;
    --app-only)
      APP_ONLY=1
      ;;
    *)
      # Остальное — аргументы electron-builder (например --publish always).
      BUILDER_ARGS+=("$arg")
      ;;
  esac
done

if [[ -n "$BACKEND_ONLY" && -n "$APP_ONLY" ]]; then
  echo "ОШИБКА: --backend-only и --app-only взаимоисключающи" >&2
  exit 1
fi

# Страховка от регрессии: каждый бинарник должен нести ровно свой срез.
# Именно необнаруженное расхождение здесь и приводило к падению на Intel.
check_arch() {
  local binary="$1" expected="$2" actual
  actual="$(lipo -archs "$binary")"
  if [[ "$actual" != "$expected" ]]; then
    echo "ОШИБКА: $binary имеет архитектуры '$actual', ожидалось '$expected'" >&2
    exit 1
  fi
  echo "  OK: $binary -> $actual"
}

build_frontend() {
  echo "==> Frontend build"
  cd "$FRONTEND_DIR"
  npm ci
  npm run build
}

# Собирает backend нативно для архитектуры текущего хоста.
# Режим onedir: в dist/photo-metadata-backend/ лежит исполняемый файл и
# распакованные библиотеки. Onefile распаковывал ~26 МБ во временный
# каталог при каждом запуске — приложение стартовало около 7,5 секунды.
build_backend_native() {
  echo "==> Backend PyInstaller: $(uname -m) (нативно)"
  cd "$BACKEND_DIR"
  # Сирота от старой схемы: та переименовывала свежий бинарник в
  # ...-arm64 и склеивала срезы через lipo. PyInstaller его не
  # перезапишет — имя другое, — и файл на 27 МБ висел бы вечно.
  rm -f dist/photo-metadata-backend-arm64
  uv sync --dev
  uv run pyinstaller "$SPEC" --noconfirm \
    --distpath dist --workpath desktop_build/build
}

# Путь бинарника в бандле важен: killOrphanedBackends() в
# desktop/src/backend-process.js ищет процесс по полному пути запуска,
# а переименование сломало бы совпадение с бинарником в бандле.
#
# PyInstaller в режиме onedir кладёт в dist/ каталог, поэтому копируется
# его содержимое, а не один файл: исполняемый остаётся по прежнему пути
# resources/backend/<arch>/photo-metadata-backend, рядом ложится _internal.
layout_backend() {
  local arch="$1" dist_dir="$2" target
  target="$DESKTOP_DIR/resources/backend/$arch"

  check_arch "$dist_dir/photo-metadata-backend/photo-metadata-backend" "$arch"

  # Остаток старой плоской раскладки: extraResources копирует
  # resources/backend/ целиком, и файл из прежних сборок иначе доехал бы
  # до бандла лишней копией.
  rm -f "$DESKTOP_DIR/resources/backend/photo-metadata-backend"

  # Каталог пересоздаётся: от прежней сборки в нём могли остаться файлы,
  # которых больше нет, и они уехали бы в бандл мёртвым грузом.
  rm -rf "$target"
  mkdir -p "$target"
  cp -R "$dist_dir/photo-metadata-backend/." "$target/"
}

# Единственная проверка, которая ловит нерабочий бинарник до релиза:
# юнит-тесты его не запускают. Нештатный порт — чтобы сборка не
# конфликтовала с уже запущенным приложением на 8000.
run_smoke() {
  local binary="$1"
  echo "==> Дымовой тест: $binary"
  PHOTO_METADATA_BACKEND_PORT=8123 \
  uv run --project "$BACKEND_DIR" python "$SMOKE_TEST" "$binary"
}

# Находит dmgbuild в кэше electron-builder, при отсутствии — скачивает
# его тем же кодом, что и сам electron-builder (dmg-builder знает нужную
# версию и её контрольные суммы, поэтому URL здесь не хардкодится).
# Результат — путь в REAL_DMGBUILD.
find_cached_dmgbuild() {
  # `|| true` обязателен: на чистой машине каталога кэша нет, find
  # возвращает 1, pipefail пробрасывает этот код через head, и под set -e
  # сборка падала прямо на присваивании — молча, без единого сообщения.
  # Пустой кэш это норма: ниже bundle просто скачается.
  find "$HOME/Library/Caches/electron-builder" \
    -type f -name dmgbuild -path '*dmgbuild-bundle*' 2>/dev/null | head -1 || true
}

ensure_dmgbuild() {
  REAL_DMGBUILD="$(find_cached_dmgbuild)"
  if [[ -n "$REAL_DMGBUILD" ]]; then
    echo "  dmgbuild: $REAL_DMGBUILD"
    return
  fi

  echo "==> dmgbuild нет в кэше — скачиваю"
  # Берём последнюю строку: сам fetch-dmgbuild.js печатает только путь, но
  # логгер dmg-builder подмешивает в stdout строку прогресса загрузки. В
  # терминале она уходит в tty и не мешает, а в CI попадала в переменную —
  # и «путь» из двух строк указывал в никуда.
  if ! REAL_DMGBUILD="$(cd "$DESKTOP_DIR" && node scripts/fetch-dmgbuild.js | tail -1)"; then
    echo "ОШИБКА: не удалось скачать dmgbuild." >&2
    echo "Без него DMG собрался бы с дефолтным фоном и без стрелки." >&2
    exit 1
  fi

  # Свежераспакованный бандл приезжает без бита исполняемости — на машине
  # разработчика он обычно уже выставлен прошлыми распаковками, поэтому
  # видно это только на чистом раннере. Проставляем сами: отсутствие бита
  # не повод падать, а вот молча собрать DMG без обёртки нельзя.
  if [[ ! -x "$REAL_DMGBUILD" ]]; then
    chmod +x "$REAL_DMGBUILD"
  fi

  if [[ ! -x "$REAL_DMGBUILD" ]]; then
    echo "ОШИБКА: не удалось сделать $REAL_DMGBUILD исполняемым." >&2
    exit 1
  fi
  echo "  dmgbuild: $REAL_DMGBUILD"
}

build_app() {
  echo "==> electron-builder --mac"

  # extraResources копирует resources/backend/ целиком, поэтому срез
  # чужой архитектуры от прежних сборок молча уехал бы в бандл и удвоил
  # его вес. Каталог в .gitignore, так что чистой копией это не лечится.
  local stale
  for stale in "$DESKTOP_DIR"/resources/backend/*/; do
    [[ -d "$stale" ]] || continue
    if [[ "$(basename "$stale")" != "arm64" ]]; then
      echo "  удаляю срез прежней сборки: $(basename "$stale")"
      rm -rf "$stale"
    fi
  done

  if [[ ! -f "$DESKTOP_DIR/resources/backend/arm64/photo-metadata-backend" ]]; then
    echo "ОШИБКА: нет resources/backend/arm64/photo-metadata-backend." >&2
    echo "Соберите его: desktop/scripts/build-mac.sh --backend-only=arm64" >&2
    exit 1
  fi

  cd "$DESKTOP_DIR"
  npm ci

  # Обёртка dmgbuild убирает дефолтный фон DMG (любой кастомный фон
  # делает подписи Finder чёрными независимо от темы), добавляет
  # файлы-иконки стрелки и подсказки (build/dmg-*.icns) и отодвигает
  # служебные файлы тома от иконок.
  #
  # Обёртке нужен настоящий dmgbuild, который electron-builder скачивает
  # в свой кэш. Раньше при пустом кэше сборка молча продолжалась без
  # обёртки — именно так релизный DMG уехал с дефолтным фоном: на чистом
  # раннере CI кэша нет по определению, а первая же сборка и была
  # релизной. Теперь бандл при необходимости скачивается заранее
  # штатным механизмом (с проверкой контрольной суммы), а если и это не
  # удалось — сборка падает, вместо того чтобы выпустить дефолтный DMG.
  ensure_dmgbuild

  export REAL_DMGBUILD
  export CUSTOM_DMGBUILD_PATH="$DESKTOP_DIR/scripts/dmgbuild-wrapper.sh"

  # --publish never жёстко: даже если флаг не передали, electron-builder
  # умеет публиковать сам по наличию тега, а публиковать он может только
  # неподписанное.
  npx electron-builder --mac --publish never "${BUILDER_ARGS[@]+"${BUILDER_ARGS[@]}"}"

  check_dmg
  publish_artifacts
}

# Проверка образа перед публикацией.
#
# Образ намеренно НЕ подписывается. Ad-hoc подпись DMG ломает открытие
# скачанного файла: Gatekeeper проверяет подпись образа, не находит
# Developer ID и блокирует монтирование — двойной клик из браузера
# завершается ошибкой -128, без диалога и без кнопки «Открыть всё равно».
# Неподписанный образ проверять нечего, и он монтируется штатно.
#
# Проверено на одном и том же содержимом: подписанный образ не
# открывается, он же после `hdiutil convert` (подпись не переносится) —
# открывается. Бандла приложения это не касается: `identity: '-'` в
# electron-builder.yml остаётся, без подписи macOS считает его
# повреждённым.
check_dmg() {
  local dmg found=0 version signature

  version="$(node -p "require('$DESKTOP_DIR/package.json').version")"

  for dmg in "$DESKTOP_DIR"/out/*-"$version"-*.dmg; do
    [[ -e "$dmg" ]] || continue
    found=1

    # Вывод забирается в переменную, а не через `| grep -q`: под pipefail
    # код конвейера складывается из обеих команд и даёт ложный результат.
    signature="$(codesign -dv "$dmg" 2>&1 || true)"

    if [[ "$signature" == *"Signature="* ]]; then
      echo "ОШИБКА: $(basename "$dmg") подписан — скачанный образ не смонтируется." >&2
      echo "$signature" >&2
      exit 1
    fi

    echo "==> Образ без подписи, как и требуется: $(basename "$dmg")"
  done

  if [[ "$found" -eq 0 ]]; then
    echo "ОШИБКА: в $DESKTOP_DIR/out не найдено ни одного .dmg версии $version" >&2
    exit 1
  fi

  # Страховка: если содержимое образа когда-нибудь изменится после
  # упаковки, манифест обновления обязан догнать, иначе electron-updater
  # отвергнет скачанный файл по несовпадению суммы.
  node "$DESKTOP_DIR/scripts/update-latest-mac.js" "$DESKTOP_DIR/out"
}

# Загрузка артефактов в релиз — уже подписанных.
#
# Релиз создаётся черновиком: проверка обновлений видит его только после
# ручной публикации, и это единственный гейт между сборкой и
# пользователями — до публикации артефакт можно скачать и проверить.
publish_artifacts() {
  local version tag staging file target

  [[ -n "$PUBLISH" && "$PUBLISH" != "never" ]] || return 0

  version="$(node -p "require('$DESKTOP_DIR/package.json').version")"
  tag="v$version"

  # Имена артефактов приводятся к url-safe виду: GitHub всё равно заменит
  # пробелы в ссылке на скачивание, а лендинг и latest-mac.yml ссылаются
  # именно на дефисный вариант. Без переименования ссылки бьются в 404.
  staging="$(mktemp -d)"
  for file in "$DESKTOP_DIR"/out/*-"$version"-*.{dmg,zip,blockmap} "$DESKTOP_DIR/out/latest-mac.yml"; do
    [[ -e "$file" ]] || continue
    target="$(basename "$file" | tr ' ' '-')"
    cp "$file" "$staging/$target"
  done

  if ! gh release view "$tag" >/dev/null 2>&1; then
    gh release create "$tag" --draft --title "$tag" --notes 'Черновик: заметки заполняются вручную перед публикацией.'
  fi

  gh release upload "$tag" "$staging"/* --clobber
  echo "==> Артефакты загружены в релиз $tag"
}

if [[ -n "$APP_ONLY" ]]; then
  build_app
  echo "==> Готово: артефакты в $DESKTOP_DIR/out/"
  exit 0
fi

if [[ -n "$BACKEND_ONLY" ]]; then
  # Нативная сборка: раннер матрицы обязан совпадать с целевым срезом,
  # иначе PyInstaller молча соберёт архитектуру хоста.
  host_arch="$(uname -m)"
  if [[ "$host_arch" != "$BACKEND_ONLY" ]]; then
    echo "ОШИБКА: --backend-only=$BACKEND_ONLY требует хост $BACKEND_ONLY," >&2
    echo "текущий хост — $host_arch. Проверьте runs-on в workflow." >&2
    exit 1
  fi
  build_frontend
  build_backend_native
  layout_backend "$BACKEND_ONLY" dist
  run_smoke "$BACKEND_DIR/dist/photo-metadata-backend/photo-metadata-backend"
  echo "==> Готово: resources/backend/$BACKEND_ONLY/photo-metadata-backend"
  exit 0
fi

echo "==> [1/3] Frontend"
build_frontend

echo "==> [2/3] Backend"
build_backend_native
layout_backend arm64 dist
run_smoke "$BACKEND_DIR/dist/photo-metadata-backend/photo-metadata-backend"

echo "==> [3/3] Приложение"
build_app

echo "==> Готово: артефакты в $DESKTOP_DIR/out/"
