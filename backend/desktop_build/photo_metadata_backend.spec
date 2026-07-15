# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec для desktop-бинарника backend.

Сборка (из каталога backend/):
    uv run pyinstaller desktop_build/photo_metadata_backend.spec

Результат: backend/dist/photo-metadata-backend (onefile).
Фронтенд-сборка (frontend/build) встраивается в бандл как frontend_build
и раздаётся FastAPI StaticFiles из app/main.py во frozen-режиме.
"""

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

SPEC_DIR = Path(SPECPATH).resolve()
BACKEND_DIR = SPEC_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_BUILD = PROJECT_ROOT / 'frontend' / 'build'

if not FRONTEND_BUILD.is_dir():
    raise SystemExit(
        f'frontend build not found: {FRONTEND_BUILD}\n'
        'Run `npm run build` in frontend/ first.'
    )

hiddenimports = [
    # uvicorn резолвит эти модули динамически по строковым именам
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.loops.uvloop',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.protocols.websockets.wsproto_impl',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
]
hiddenimports += collect_submodules('openai')
hiddenimports += collect_submodules('httpx')
hiddenimports += collect_submodules('iptcinfo3')

a = Analysis(
    [str(BACKEND_DIR / 'app' / 'desktop_main.py')],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=[(str(FRONTEND_BUILD), 'frontend_build')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='photo-metadata-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    # UPX ломает codesign/нотаризацию на macOS
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
