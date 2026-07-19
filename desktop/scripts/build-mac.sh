#!/usr/bin/env bash
# Полная сборка macOS-приложения Photo Metadata AI (.app/.dmg).
#
# Этапы:
#   1. Сборка фронтенда (frontend/build) — встраивается в бинарник backend.
#   2. Backend PyInstaller: arm64 нативно + x86_64 через Rosetta 2,
#      затем lipo-склейка в один universal2-бинарник.
#   3. electron-builder --mac (universal) -> desktop/out/.
#      Иконка build/icon.png конвертируется штатными средствами electron-builder.
#
# Неподписанная локальная сборка:
#   CSC_IDENTITY_AUTO_DISCOVERY=false desktop/scripts/build-mac.sh
#
# Подпись/нотаризация включаются автоматически при наличии в окружении
# CSC_LINK/CSC_KEY_PASSWORD и APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/
# APPLE_TEAM_ID (см. desktop/README.md).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
DESKTOP_DIR="$PROJECT_ROOT/desktop"
SPEC="desktop_build/photo_metadata_backend.spec"

echo "==> [1/3] Frontend build"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "==> [2/3] Backend PyInstaller: arm64"
cd "$BACKEND_DIR"
uv sync --dev
uv run pyinstaller "$SPEC" --noconfirm \
  --distpath dist --workpath desktop_build/build
mv dist/photo-metadata-backend dist/photo-metadata-backend-arm64

echo "==> [2/3] Backend PyInstaller: x86_64 (Rosetta 2)"
if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
  echo "Rosetta 2 не установлена. Выполните:" >&2
  echo "  softwareupdate --install-rosetta --agree-to-license" >&2
  exit 1
fi
UV_PROJECT_ENVIRONMENT=.venv-x86_64 uv sync --dev \
  --python cpython-3.13-macos-x86_64-none
.venv-x86_64/bin/pyinstaller "$SPEC" --noconfirm \
  --distpath dist-x86_64 --workpath desktop_build/build-x86_64

echo "==> [2/3] lipo: universal2"
lipo -create \
  dist/photo-metadata-backend-arm64 \
  dist-x86_64/photo-metadata-backend \
  -output dist/photo-metadata-backend
lipo -info dist/photo-metadata-backend

mkdir -p "$DESKTOP_DIR/resources/backend"
cp dist/photo-metadata-backend "$DESKTOP_DIR/resources/backend/"

echo "==> [3/3] electron-builder --mac"
cd "$DESKTOP_DIR"
npm ci

# Обёртка dmgbuild убирает дефолтный фон DMG (любой кастомный фон
# делает подписи Finder чёрными независимо от темы), добавляет
# файлы-иконки стрелки и подсказки (build/dmg-*.icns) и отодвигает
# служебные файлы тома от иконок. Настоящий dmgbuild лежит в кэше
# electron-builder после первой сборки; без него обёртка не
# подключается — DMG соберётся с дефолтным фоном и без стрелки.
REAL_DMGBUILD="$(find "$HOME/Library/Caches/electron-builder" \
  -type f -name dmgbuild -path '*dmgbuild-bundle*' 2>/dev/null | head -1)"
if [[ -n "$REAL_DMGBUILD" ]]; then
  export REAL_DMGBUILD
  export CUSTOM_DMGBUILD_PATH="$DESKTOP_DIR/scripts/dmgbuild-wrapper.sh"
else
  echo "ВНИМАНИЕ: dmgbuild не найден в кэше electron-builder;" >&2
  echo "DMG соберётся с дефолтным фоном и без стрелки. Повторите" >&2
  echo "сборку после первой успешной — кэш появится." >&2
fi

npx electron-builder --mac "$@"

echo "==> Готово: артефакты в $DESKTOP_DIR/out/"
