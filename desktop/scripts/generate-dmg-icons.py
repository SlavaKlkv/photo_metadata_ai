#!/usr/bin/env python3
"""Генерирует .icns для DMG-окна из макета build/dmg_installer.png.

Запуск из backend-окружения (там есть Pillow):
    cd backend && uv run python ../desktop/scripts/generate-dmg-icons.py

Кастомный фон DMG не используется: при любом фоне (картинке или цвете
в icvp .DS_Store) Finder всегда рисует подписи файлов чёрными,
игнорируя системную тему. Без фона окно нативное: фон и подписи
следуют теме пользователя.

Поэтому стрелка «приложение -> Applications» и строка-подсказка
добавляются в DMG отдельными файлами с кастомными иконками
(scripts/dmgbuild-wrapper.sh). Иконки файлов ограничению Finder
не подвержены; серый ~50% яркости читается в обеих темах.

Из макета вырезаются стрелка и подсказка с восстановлением
прозрачности (пиксель = bg*(1-a) + C*a). Подсказка шире иконки
(128 pt), поэтому режется на четыре плитки-иконки, встык
(центры x = 138/266/394/522 при окне 660x440 и иконках 128 pt).

Создаёт в desktop/build: dmg-arrow.icns и dmg-hint0..3.icns.
"""

import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter

BUILD_DIR = Path(__file__).resolve().parents[1] / 'build'
MOCKUP = BUILD_DIR / 'dmg_installer.png'

BACKGROUND = (25, 26, 28)  # сплошной цвет фона макета
# Серый ~50% яркости: читается и на тёмном, и на светлом фоне окна
COLOR = (127, 127, 132)

# Области макета (@2x-пиксели)
ARROW_BOX = (660, 400, 930, 600)
HINT_BOX = (380, 845, 1165, 905)

PPT = 8  # px на pt в канве иконки 1024 (иконка DMG — 128 pt)
# Ширина стрелки в окне — как в исходной композиции макета
# (186 -> 128 @1x, см. историю generate-dmg-background.py)
ARROW_WIDTH_PT = 93
HINT_WIDTH_PT = 440  # подсказка чуть крупнее подписей Finder (16 pt)
# Центры плиток подсказки в окне, встык (шаг 128 pt)
HINT_TILE_CENTERS = (138, 266, 394, 522)
HINT_CENTER_X = 330


def extract_with_alpha(
    mockup: Image.Image, box: tuple[int, int, int, int]
) -> Image.Image:
    """Вырезает фрагмент макета, восстанавливая альфу из разницы с фоном."""
    frag = mockup.crop(box)
    raw = frag.tobytes()
    diffs = [
        (
            raw[i]
            - BACKGROUND[0]
            + raw[i + 1]
            - BACKGROUND[1]
            + raw[i + 2]
            - BACKGROUND[2]
        )
        / 3
        for i in range(0, len(raw), 3)
    ]
    c_val = max(diffs)
    alpha_vals = []
    for d in diffs:
        a = max(0.0, min(1.0, d / c_val))
        if a < 0.04:  # срез шума фона
            a = 0.0
        alpha_vals.append(round(a * 255))
    alpha = Image.new('L', frag.size)
    alpha.putdata(alpha_vals)
    return alpha


def save_icns(canvas: Image.Image, name: str) -> Path:
    """Собирает .icns из канвы 1024x1024 через iconutil."""
    target = BUILD_DIR / f'{name}.icns'
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / f'{name}.iconset'
        iconset.mkdir()
        for px in (16, 32, 128, 256, 512):
            canvas.resize((px, px), Image.Resampling.LANCZOS).save(
                iconset / f'icon_{px}x{px}.png'
            )
            canvas.resize((px * 2, px * 2), Image.Resampling.LANCZOS).save(
                iconset / f'icon_{px}x{px}@2x.png'
            )
        subprocess.run(
            ['iconutil', '-c', 'icns', str(iconset), '-o', str(target)],
            check=True,
        )
    return target


def build_arrow(mockup: Image.Image) -> Path:
    alpha = extract_with_alpha(mockup, ARROW_BOX)
    w = ARROW_WIDTH_PT * PPT
    h = round(alpha.height / alpha.width * w)
    alpha = alpha.resize((w, h), Image.Resampling.LANCZOS)
    arrow = Image.new('RGBA', (w, h), (*COLOR, 0))
    arrow.putalpha(alpha)
    canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    canvas.paste(arrow, ((1024 - w) // 2, (1024 - h) // 2))
    return save_icns(canvas, 'dmg-arrow')


def build_hint_tiles(mockup: Image.Image) -> list[Path]:
    alpha = extract_with_alpha(mockup, HINT_BOX)
    w = HINT_WIDTH_PT * PPT
    h = round(alpha.height / alpha.width * w)
    alpha = alpha.resize((w, h), Image.Resampling.LANCZOS)
    # Утолщение штрихов ~0.5 pt: полужирное начертание
    alpha = alpha.filter(ImageFilter.MaxFilter(5))
    hint = Image.new('RGBA', (w, h), (*COLOR, 0))
    hint.putalpha(alpha)

    targets = []
    hint_left_pt = HINT_CENTER_X - HINT_WIDTH_PT / 2
    for i, cx in enumerate(HINT_TILE_CENTERS):
        canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        tile_left_pt = cx - 64
        src_x0 = max(0, round((tile_left_pt - hint_left_pt) * PPT))
        src_x1 = min(w, round((tile_left_pt + 128 - hint_left_pt) * PPT))
        if src_x1 > src_x0:
            piece = hint.crop((src_x0, 0, src_x1, h))
            dst_x = round(src_x0 - (tile_left_pt - hint_left_pt) * PPT)
            canvas.paste(piece, (dst_x, (1024 - h) // 2))
        targets.append(save_icns(canvas, f'dmg-hint{i}'))
    return targets


def main() -> None:
    mockup = Image.open(MOCKUP).convert('RGB')
    created = [build_arrow(mockup), *build_hint_tiles(mockup)]
    print('OK:', ', '.join(str(p) for p in created))


if __name__ == '__main__':
    main()
