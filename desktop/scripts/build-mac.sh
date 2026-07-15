#!/usr/bin/env bash
# Полная сборка macOS-приложения Photo Metadata AI (.app/.dmg).
#
# Этапы:
#   1. Сборка фронтенда (frontend/build) — встраивается в бинарник backend.
#   2. Backend PyInstaller: arm64 нативно + x86_64 через Rosetta 2,
#      затем lipo-склейка в один universal2-бинарник.
#   3. Генерация build/icon.icns из build/icon.png (если .icns ещё нет).
#   4. electron-builder --mac (universal) -> desktop/out/.
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

echo "==> [1/4] Frontend build"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "==> [2/4] Backend PyInstaller: arm64"
cd "$BACKEND_DIR"
uv sync --dev
uv run pyinstaller "$SPEC" --noconfirm \
  --distpath dist --workpath desktop_build/build
mv dist/photo-metadata-backend dist/photo-metadata-backend-arm64

echo "==> [2/4] Backend PyInstaller: x86_64 (Rosetta 2)"
if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
  echo "Rosetta 2 не установлена. Выполните:" >&2
  echo "  softwareupdate --install-rosetta --agree-to-license" >&2
  exit 1
fi
UV_PROJECT_ENVIRONMENT=.venv-x86_64 uv sync --dev \
  --python cpython-3.13-macos-x86_64-none
.venv-x86_64/bin/pyinstaller "$SPEC" --noconfirm \
  --distpath dist-x86_64 --workpath desktop_build/build-x86_64

echo "==> [2/4] lipo: universal2"
lipo -create \
  dist/photo-metadata-backend-arm64 \
  dist-x86_64/photo-metadata-backend \
  -output dist/photo-metadata-backend
lipo -info dist/photo-metadata-backend

mkdir -p "$DESKTOP_DIR/resources/backend"
cp dist/photo-metadata-backend "$DESKTOP_DIR/resources/backend/"

echo "==> [3/4] App icon (.icns)"
cd "$DESKTOP_DIR"
if [ ! -f build/icon.icns ]; then
  # icon.png должен быть full-bleed (squircle во весь холст, без полей):
  # macOS Tahoe сама вписывает такую графику в системную форму, а иконку
  # с прозрачными полями кладёт на белую плашку.
  ICONSET_DIR="$(mktemp -d)/icon.iconset"
  mkdir -p "$ICONSET_DIR"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" build/icon.png \
      --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" build/icon.png \
      --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET_DIR" -o build/icon.icns
fi

echo "==> [4/4] electron-builder --mac"
npm ci
npx electron-builder --mac

echo "==> Готово: артефакты в $DESKTOP_DIR/out/"
