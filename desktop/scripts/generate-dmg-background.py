#!/usr/bin/env python3
"""Генерирует фон DMG-окна со стрелкой «приложение → Applications».

Запуск из backend-окружения (там есть Pillow):
    cd backend && uv run python ../desktop/scripts/generate-dmg-background.py

Создаёт desktop/build/dmg-background.png (540x380), @2x-вариант и
объединённый retina-TIFF, на который ссылается electron-builder.yml.
Позиции стрелки согласованы с dmg.contents (иконки в x=140 и x=400,
y=190, размер 100px).
"""

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

BUILD_DIR = Path(__file__).resolve().parents[1] / 'build'

WIDTH, HEIGHT = 540, 340
# Подписи Finder рисует чёрным и перекрасить их нельзя, поэтому
# при тёмном фоне под ними рисуются светлые плашки.
BACKGROUND = '#17151f'  # цвет loading-окна приложения (main.js)
ACCENT = '#b3a6f7'
LABEL_PLATE = '#a7a3bb'

# Центр между иконками (140 и 400 по x, 170 по y).
ICON_XS = (140, 400)
LABEL_PLATE_Y = 236      # центр строки подписи под иконкой 100px
LABEL_PLATE_SIZES = ((200, 28), (120, 28))  # под длину подписей
ARROW_Y = 170
ARROW_X_START, ARROW_X_END = 225, 315
SHAFT_WIDTH = 8
HEAD_LENGTH = 26
HEAD_WIDTH = 30


def draw_background(scale: int) -> Image.Image:
    image = Image.new(
        'RGB', (WIDTH * scale, HEIGHT * scale), color=BACKGROUND
    )
    draw = ImageDraw.Draw(image)

    y = ARROW_Y * scale
    x_start = ARROW_X_START * scale
    x_end = ARROW_X_END * scale
    shaft_end = x_end - HEAD_LENGTH * scale

    draw.line(
        [(x_start, y), (shaft_end, y)],
        fill=ACCENT,
        width=SHAFT_WIDTH * scale,
    )
    draw.polygon(
        [
            (x_end, y),
            (shaft_end, y - HEAD_WIDTH * scale // 2),
            (shaft_end, y + HEAD_WIDTH * scale // 2),
        ],
        fill=ACCENT,
    )

    for icon_x, (plate_w, plate_h) in zip(ICON_XS, LABEL_PLATE_SIZES):
        cx = icon_x * scale
        cy = LABEL_PLATE_Y * scale
        half_w = plate_w * scale // 2
        half_h = plate_h * scale // 2
        draw.rounded_rectangle(
            [(cx - half_w, cy - half_h), (cx + half_w, cy + half_h)],
            radius=plate_h * scale // 2,
            fill=LABEL_PLATE,
        )
    return image


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    base = BUILD_DIR / 'dmg-background.png'
    retina = BUILD_DIR / 'dmg-background@2x.png'
    tiff = BUILD_DIR / 'dmg-background.tiff'

    draw_background(1).save(base)
    draw_background(2).save(retina)

    subprocess.run(
        [
            'tiffutil',
            '-cathidpicheck',
            str(base),
            str(retina),
            '-out',
            str(tiff),
        ],
        check=True,
    )
    print(f'OK: {base}, {retina}, {tiff}')


if __name__ == '__main__':
    main()
