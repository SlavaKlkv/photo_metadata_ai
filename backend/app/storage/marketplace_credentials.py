import json
import os
from pathlib import Path
from typing import Any

import structlog

from app.core.config import PROJECT_ROOT, settings
from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.storage.constants import MARKETPLACE_CREDENTIALS_FILENAME

logger = structlog.get_logger(__name__)


def load_marketplace_credentials_records() -> dict[str, dict[str, Any]]:
    credentials_path = get_marketplace_credentials_path()

    records = _read_marketplace_credentials_records(credentials_path)
    if records is not None:
        return records

    legacy_credentials_path = get_legacy_marketplace_credentials_path()
    if legacy_credentials_path == credentials_path:
        return {}

    legacy_records = _read_marketplace_credentials_records(
        legacy_credentials_path
    )
    if legacy_records is None:
        return {}

    write_marketplace_credentials_records(legacy_records)
    logger.info(
        'marketplace_credentials_legacy_file_migrated',
        legacy_path=str(legacy_credentials_path),
        desktop_storage_path=str(credentials_path),
    )
    return legacy_records


def _read_marketplace_credentials_records(
    credentials_path: Path,
) -> dict[str, dict[str, Any]] | None:
    if not credentials_path.is_file():
        return None

    try:
        payload = json.loads(credentials_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning(
            'marketplace_credentials_load_failed',
            path=str(credentials_path),
            error_type=type(error).__name__,
        )
        return {}

    if not isinstance(payload, dict):
        return {}

    return {
        str(marketplace): record
        for marketplace, record in payload.items()
        if isinstance(record, dict)
    }


def write_marketplace_credentials_records(
    records: dict[str, dict[str, Any]],
) -> Path:
    credentials_path = get_marketplace_credentials_path()
    credentials_path.parent.mkdir(parents=True, exist_ok=True)
    credentials_path.write_text(
        json.dumps(records, indent=2, sort_keys=True),
        encoding='utf-8',
    )

    try:
        os.chmod(credentials_path, 0o600)
    except OSError as error:
        logger.warning(
            'marketplace_credentials_chmod_failed',
            path=str(credentials_path),
            error_type=type(error).__name__,
        )

    return credentials_path


def get_marketplace_credentials_path() -> Path:
    runtime_directories = ensure_runtime_directories()
    return resolve_path_in_base(
        runtime_directories.workspace_dir,
        MARKETPLACE_CREDENTIALS_FILENAME,
    )


def get_legacy_marketplace_credentials_path() -> Path:
    legacy_workspace_dir = (settings.WORKSPACE_DIR or PROJECT_ROOT).resolve(
        strict=False,
    )
    return resolve_path_in_base(
        legacy_workspace_dir,
        MARKETPLACE_CREDENTIALS_FILENAME,
    )
