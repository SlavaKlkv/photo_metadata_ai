#!/usr/bin/env bash
# Полная сборка macOS-приложения Photo Metadata AI (.app/.dmg).
#
# Этапы:
#   1. Сборка фронтенда (frontend/build) — встраивается в бинарник backend.
#   2. Backend PyInstaller: arm64 нативно + x86_64 через Rosetta 2.
#      Бинарники намеренно НЕ склеиваются через lipo: spec собирает
#      onefile, где Python и .dylib приклеены overlay'ем в конец файла,
#      а lipo сохраняет только один overlay (arm64, т.к. сортирует срезы
#      по CPU type). Оба среза тогда распаковывают arm64-библиотеки, и на
#      Intel backend падает с "have 'arm64', need 'x86_64'". Поэтому оба
#      бинарника кладутся раздельно, а нужный выбирается в рантайме
#      (desktop/src/backend-process.js по process.arch).
#   3. electron-builder --mac (universal) -> desktop/out/.
#      Иконка build/icon.png конвертируется штатными средствами electron-builder.
#
# Частичный запуск (используется матрицей в .github/workflows/release.yml,
# чтобы каждый срез собирался на своей архитектуре нативно, без Rosetta):
#   --backend-only=<arm64|x86_64>  только фронтенд + backend этого среза.
#                                  Собирает нативно и требует, чтобы хост
#                                  был той же архитектуры.
#   --app-only                     только electron-builder; ожидает готовые
#                                  resources/backend/{arm64,x86_64}/.
# Без этих флагов сборка идёт целиком, как раньше (x86_64 через Rosetta).
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
      if [[ "$BACKEND_ONLY" != "arm64" && "$BACKEND_ONLY" != "x86_64" ]]; then
        echo "ОШИБКА: --backend-only ожидает arm64 или x86_64, получено '$BACKEND_ONLY'" >&2
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
# dist/photo-metadata-backend остаётся под нативным именем: на него
# опирается dev-режим в desktop/src/backend-process.js.
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

# Собирает x86_64-срез на ARM-хосте через Rosetta 2.
build_backend_rosetta_x86_64() {
  echo "==> Backend PyInstaller: x86_64 (Rosetta 2)"
  cd "$BACKEND_DIR"
  if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
    echo "Rosetta 2 не установлена. Выполните:" >&2
    echo "  softwareupdate --install-rosetta --agree-to-license" >&2
    exit 1
  fi
  UV_PROJECT_ENVIRONMENT=.venv-x86_64 uv sync --dev \
    --python cpython-3.13-macos-x86_64-none
  .venv-x86_64/bin/pyinstaller "$SPEC" --noconfirm \
    --distpath dist-x86_64 --workpath desktop_build/build-x86_64
}

# Имя файла одинаковое в обоих подкаталогах: killOrphanedBackends()
# в desktop/src/backend-process.js ищет процесс по полному пути
# запуска, а переименование сломало бы совпадение с бинарником в бандле.
layout_backend() {
  local arch="$1" dist_dir="$2"
  check_arch "$dist_dir/photo-metadata-backend" "$arch"
  # Остаток старой плоской раскладки. extraResources копирует
  # resources/backend/ целиком, а x64ArchFiles его не покрывает (glob
  # требует подкаталог), поэтому файл едет в бандл идентичным в обеих
  # ветках сборки и роняет universal-merge у всех, кто раньше собирал
  # старую версию.
  rm -f "$DESKTOP_DIR/resources/backend/photo-metadata-backend"
  mkdir -p "$DESKTOP_DIR/resources/backend/$arch"
  cp "$dist_dir/photo-metadata-backend" "$DESKTOP_DIR/resources/backend/$arch/"
}

# Единственная проверка, которая ловит нерабочий срез до релиза:
# юнит-тесты бинарник не запускают. Обёртка `arch` не нужна — на ARM-хосте
# macOS сама поднимает чистый x86_64-бинарник под Rosetta. Нештатный порт —
# чтобы сборка не конфликтовала с уже запущенным приложением на 8000.
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
  find "$HOME/Library/Caches/electron-builder" \
    -type f -name dmgbuild -path '*dmgbuild-bundle*' 2>/dev/null | head -1
}

ensure_dmgbuild() {
  REAL_DMGBUILD="$(find_cached_dmgbuild)"
  if [[ -n "$REAL_DMGBUILD" ]]; then
    echo "  dmgbuild: $REAL_DMGBUILD"
    return
  fi

  echo "==> dmgbuild нет в кэше — скачиваю"
  if ! REAL_DMGBUILD="$(cd "$DESKTOP_DIR" && node scripts/fetch-dmgbuild.js)"; then
    echo "ОШИБКА: не удалось скачать dmgbuild." >&2
    echo "Без него DMG собрался бы с дефолтным фоном и без стрелки." >&2
    exit 1
  fi

  if [[ ! -x "$REAL_DMGBUILD" ]]; then
    echo "ОШИБКА: $REAL_DMGBUILD не исполняем." >&2
    exit 1
  fi
  echo "  dmgbuild: $REAL_DMGBUILD"
}

build_app() {
  echo "==> electron-builder --mac"
  local arch
  for arch in arm64 x86_64; do
    if [[ ! -f "$DESKTOP_DIR/resources/backend/$arch/photo-metadata-backend" ]]; then
      echo "ОШИБКА: нет resources/backend/$arch/photo-metadata-backend." >&2
      echo "Соберите его: desktop/scripts/build-mac.sh --backend-only=$arch" >&2
      exit 1
    fi
  done

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

  sign_dmg
  publish_artifacts
}

# Ad-hoc подпись самого образа.
#
# `identity: '-'` в electron-builder.yml подписывает только бандл
# приложения, DMG выходит из сборки вовсе без подписи. Локально это
# незаметно, но браузер вешает на скачанный файл com.apple.quarantine, и
# тогда Gatekeeper проверяет образ раньше приложения: без подписи он
# получает "no usable signature" и блокирует монтирование — по клику в
# панели загрузок не происходит ничего. Ad-hoc подпись возвращает
# штатный сценарий «неизвестный разработчик» с обходом через настройки
# безопасности. Полностью диалог убирает только нотаризация, для которой
# нужны учётные данные Apple Developer.
sign_dmg() {
  local dmg found=0 version

  # Только образы текущей версии: в out/ рядом лежат артефакты прошлых
  # релизов, и переподписывать их сборка не имеет права — однажды это
  # уже уронило её на чужом DMG, так и не дойдя до собранного.
  version="$(node -p "require('$DESKTOP_DIR/package.json').version")"

  for dmg in "$DESKTOP_DIR"/out/*-"$version"-*.dmg; do
    [[ -e "$dmg" ]] || continue
    found=1

    codesign --force --sign - "$dmg"

    # Подпись обязана быть на месте: молча выпустить неподписанный образ
    # нельзя — ровно так и уехал релиз, который не открывался из браузера.
    #
    # Вывод забирается в переменную, а не через `| grep -q`: под pipefail
    # код конвейера складывается из обеих команд, и ранний выход grep
    # давал ложное «подпись не легла» на заведомо подписанном образе.
    local signature
    signature="$(codesign -dv "$dmg" 2>&1 || true)"

    if [[ "$signature" != *"Signature=adhoc"* ]]; then
      echo "ОШИБКА: ad-hoc подпись не легла на $dmg" >&2
      echo "$signature" >&2
      exit 1
    fi

    echo "==> Подписан ad-hoc: $(basename "$dmg")"
  done

  if [[ "$found" -eq 0 ]]; then
    echo "ОШИБКА: в $DESKTOP_DIR/out не найдено ни одного .dmg версии $version" >&2
    exit 1
  fi

  # codesign меняет содержимое образа, поэтому суммы в манифесте
  # обновления надо пересчитать — иначе автообновление отвергнет DMG.
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
  run_smoke "$BACKEND_DIR/dist/photo-metadata-backend"
  echo "==> Готово: resources/backend/$BACKEND_ONLY/photo-metadata-backend"
  exit 0
fi

echo "==> [1/3] Frontend"
build_frontend

echo "==> [2/3] Backend"
build_backend_native
layout_backend arm64 dist
build_backend_rosetta_x86_64
layout_backend x86_64 dist-x86_64
run_smoke "$BACKEND_DIR/dist/photo-metadata-backend"
run_smoke "$BACKEND_DIR/dist-x86_64/photo-metadata-backend"

echo "==> [3/3] Приложение"
build_app

echo "==> Готово: артефакты в $DESKTOP_DIR/out/"
