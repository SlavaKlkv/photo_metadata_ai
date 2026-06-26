import json
from pathlib import Path
from typing import Any

import structlog

from app.core.config import PROJECT_ROOT, settings
from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.storage.constants import DESKTOP_SETTINGS_FILENAME

logger = structlog.get_logger(__name__)


def load_desktop_settings_payload() -> dict[str, Any]:
    settings_path = get_desktop_settings_path()

    payload = _read_desktop_settings_payload(settings_path)
    if payload is not None:
        return payload

    legacy_settings_path = get_legacy_desktop_settings_path()
    if legacy_settings_path == settings_path:
        return {}

    legacy_payload = _read_desktop_settings_payload(legacy_settings_path)
    if legacy_payload is None:
        return {}

    write_desktop_settings_payload(legacy_payload)
    _remove_legacy_desktop_settings_file(legacy_settings_path)
    logger.info(
        'desktop_settings_legacy_file_migrated',
        legacy_path=str(legacy_settings_path),
        desktop_storage_path=str(settings_path),
    )
    return legacy_payload


def _read_desktop_settings_payload(
    settings_path: Path,
) -> dict[str, Any] | None:
    if not settings_path.is_file():
        return None

    try:
        payload = json.loads(settings_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning(
            'desktop_settings_load_failed',
            path=str(settings_path),
            error=str(error),
        )
        return {}

    if not isinstance(payload, dict):
        return {}

    return payload


def _remove_legacy_desktop_settings_file(settings_path: Path) -> None:
    try:
        settings_path.unlink(missing_ok=True)
    except OSError as error:
        logger.warning(
            'desktop_settings_legacy_file_remove_failed',
            path=str(settings_path),
            error_type=type(error).__name__,
        )


def write_desktop_settings_payload(payload: dict[str, Any]) -> Path:
    settings_path = get_desktop_settings_path()
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True),
        encoding='utf-8',
    )
    return settings_path


def get_desktop_settings_path() -> Path:
    runtime_directories = ensure_runtime_directories()
    return resolve_path_in_base(
        runtime_directories.workspace_dir,
        DESKTOP_SETTINGS_FILENAME,
    )


def get_legacy_desktop_settings_path() -> Path:
    legacy_workspace_dir = (settings.WORKSPACE_DIR or PROJECT_ROOT).resolve(
        strict=False,
    )
    return resolve_path_in_base(
        legacy_workspace_dir,
        DESKTOP_SETTINGS_FILENAME,
    )
