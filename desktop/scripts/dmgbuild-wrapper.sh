#!/usr/bin/env bash
# Обёртка над dmgbuild для electron-builder (env CUSTOM_DMGBUILD_PATH).
#
# Кастомный фон DMG не используется: при любом фоне (картинке или
# цвете в icvp .DS_Store) Finder всегда рисует подписи файлов
# чёрными, игнорируя системную тему. Без фона окно нативное, а
# стрелка «приложение -> Applications» и строка-подсказка добавляются
# отдельными файлами с кастомными иконками (build/dmg-arrow.icns и
# build/dmg-hint*.icns из scripts/generate-dmg-icons.py) — иконки
# файлов ограничению Finder не подвержены.
#
# Обёртка:
#   - создаёт во временной папке файлы стрелки и плиток подсказки
#     с невидимыми именами (unicode-пробелы) и применяет к ним
#     иконки через NSWorkspace (резурс-форк + флаг custom icon);
#   - дописывает их в settings-JSON от dmg-builder: dmgbuild копирует
#     contents-файлы через /usr/bin/ditto, сохраняя резурс-форки;
#   - фиксирует окну размер 600x400 (композиция рассчитана на него);
#   - задаёт служебным файлам тома далёкие координаты, чтобы при
#     включённом показе скрытых файлов они не лежали рядом с иконками.
# Затем вызывает python-бандл dmgbuild (путь бинарника в
# REAL_DMGBUILD, задаётся в build-mac.sh) через мини-драйвер.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../build"

if [[ -z "${REAL_DMGBUILD:-}" || ! -x "$REAL_DMGBUILD" ]]; then
  echo "dmgbuild-wrapper: REAL_DMGBUILD не задан или не исполняем" >&2
  exit 1
fi

# Аргументы electron-builder: -s <settings.json> <volume-name> <output.dmg>
settings=""
positional=()
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-s" ]]; then
    settings="$arg"
  elif [[ "$arg" != "-s" ]]; then
    positional+=("$arg")
  fi
  prev="$arg"
done
if [[ -z "$settings" || ! -f "$settings" ]]; then
  echo "dmgbuild-wrapper: не найден файл настроек (-s)" >&2
  exit 1
fi
if [[ ${#positional[@]} -ne 2 ]]; then
  echo "dmgbuild-wrapper: ожидались аргументы <volume-name> <output.dmg>," \
    "получено: ${positional[*]:-<пусто>}" >&2
  exit 1
fi
volume_name="${positional[0]}"
output_dmg="${positional[1]}"

# Файлы стрелки и подсказки: невидимые имена из unicode-пробелов
# (NBSP — стрелка; en/em/three-per-em/four-per-em space — плитки).
extra_dir="$(mktemp -d)"
trap 'rm -rf "$extra_dir"' EXIT
ARROW_NAME=$(printf '\xc2\xa0')
TILE_NAMES=(
  "$(printf '\xe2\x80\x82')"
  "$(printf '\xe2\x80\x83')"
  "$(printf '\xe2\x80\x84')"
  "$(printf '\xe2\x80\x85')"
)

apply_icon() {
  # $1 — .icns, $2 — целевой файл
  : > "$2"
  local ok
  ok=$(osascript -l JavaScript - "$1" "$2" <<'JXA'
function run(argv) {
  ObjC.import('AppKit');
  const img = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
  return $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, argv[1], 0);
}
JXA
  )
  if [[ "$ok" != "true" ]]; then
    echo "dmgbuild-wrapper: не удалось применить иконку $1" >&2
    exit 1
  fi
}

apply_icon "$BUILD_DIR/dmg-arrow.icns" "$extra_dir/$ARROW_NAME"
for i in 0 1 2 3; do
  apply_icon "$BUILD_DIR/dmg-hint$i.icns" "$extra_dir/${TILE_NAMES[$i]}"
done

EXTRA_DIR="$extra_dir" python3 - "$settings" <<'PYEOF'
import json
import os
import sys

path = sys.argv[1]
with open(path) as fp:
    settings = json.load(fp)

# dmg-builder при отсутствии dmg.background в конфиге подставляет
# свой дефолтный фон — убираем его: любой кастомный фон делает
# подписи Finder чёрными независимо от темы.
settings.pop('background', None)
settings.pop('background-color', None)

window = settings.setdefault('window', {})
window['size'] = {'width': 600, 'height': 400}
window['position'] = {'x': 400, 'y': 200}

contents = settings.setdefault('contents', [])

# Стрелка между иконками и плитки подсказки под ними (позиции
# согласованы с electron-builder.yml и generate-dmg-icons.py)
extra_dir = os.environ['EXTRA_DIR']
arrow = '\u00a0'
tiles = ['\u2002', '\u2003', '\u2004', '\u2005']
contents.append({
    'x': 300,
    'y': 150,
    'type': 'file',
    'path': os.path.join(extra_dir, arrow),
})
for x, name in zip([108, 236, 364, 492], tiles):
    contents.append({
        'x': x,
        'y': 315,
        'type': 'file',
        'path': os.path.join(extra_dir, name),
    })

service_files = [
    '.VolumeIcon.icns',
    '.DS_Store',
    '.fseventsd',
    '.Trashes',
]
for index, name in enumerate(service_files):
    contents.append({
        'x': 2000 + 110 * index,
        'y': 1500,
        'type': 'position',
        'path': name,
    })

with open(path, 'w') as fp:
    json.dump(settings, fp, indent=2)
PYEOF

bundle_root="$(cd "$(dirname "$REAL_DMGBUILD")" && pwd)"
bundle_python="$bundle_root/python/bin/python3"
bundle_lib="$bundle_root/python/lib"
if [[ ! -x "$bundle_python" ]]; then
  echo "dmgbuild-wrapper: не найден python бандла: $bundle_python" >&2
  exit 1
fi

PYTHONPATH="$bundle_lib" "$bundle_python" - \
  "$settings" "$volume_name" "$output_dmg" <<'PYEOF'
import sys

from dmgbuild.core import build_dmg

settings_file, volume_name, output_dmg = sys.argv[1:4]
build_dmg(
    output_dmg,
    volume_name,
    settings_file=settings_file,
)
PYEOF
