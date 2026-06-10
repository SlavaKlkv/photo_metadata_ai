import json
from pathlib import Path
from typing import Any

import structlog

from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.storage.constants import DESKTOP_SETTINGS_FILENAME

logger = structlog.get_logger(__name__)


def load_desktop_settings_payload() -> dict[str, Any]:
    settings_path = get_desktop_settings_path()

    if not settings_path.is_file():
        return {}

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
