import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from app.core.enums import MarketplaceConnectionStatus, StockPlatform
from app.core.runtime import ensure_runtime_directories, resolve_path_in_base
from app.schemas.marketplace import (
    MarketplaceConnectionsResponse,
    MarketplaceConnectionState,
    MarketplaceCredentialsRequest,
    MarketplaceValidationIssue,
)
from app.services.marketplace.marketplace_connection import (
    extract_credential_material,
    validate_marketplace_credentials,
)

logger = structlog.get_logger(__name__)

CREDENTIALS_FILENAME = 'marketplace_credentials.json'


async def list_marketplace_connections() -> MarketplaceConnectionsResponse:
    records = _load_credentials()
    return MarketplaceConnectionsResponse(
        connections=[
            _build_connection_state(
                marketplace,
                records.get(marketplace.value),
            )
            for marketplace in StockPlatform
        ],
    )


async def get_marketplace_connection(
    marketplace: StockPlatform,
) -> MarketplaceConnectionState:
    records = _load_credentials()
    return _build_connection_state(marketplace, records.get(marketplace.value))


async def save_marketplace_credentials(
    marketplace: StockPlatform,
    credentials: MarketplaceCredentialsRequest,
) -> MarketplaceConnectionState:
    validation = await validate_marketplace_credentials(
        marketplace,
        credentials,
    )
    material = extract_credential_material(credentials)
    records = _load_credentials()
    existing_record = records.get(marketplace.value)
    now = datetime.now(UTC)

    record = {
        'marketplace': marketplace.value,
        'credential_type': material.credential_type,
        'account_id': validation.account_id or material.account_id,
        'status': validation.status.value,
        'error': validation.error.model_dump() if validation.error else None,
        'last_validated_at': validation.validated_at.isoformat(),
        'updated_at': now.isoformat(),
    }

    if validation.valid:
        record['secret'] = material.secret
    elif existing_record is not None:
        logger.info(
            'marketplace_credentials_update_rejected_existing_preserved',
            marketplace=marketplace.value,
            status=validation.status.value,
        )
        return _build_connection_state(marketplace, record)

    records[marketplace.value] = record
    _write_credentials(records)

    logger.info(
        'marketplace_credentials_saved',
        marketplace=marketplace.value,
        status=validation.status.value,
    )
    return _build_connection_state(marketplace, records[marketplace.value])


async def delete_marketplace_credentials(
    marketplace: StockPlatform,
) -> MarketplaceConnectionState:
    records = _load_credentials()
    removed = records.pop(marketplace.value, None) is not None
    _write_credentials(records)

    logger.info(
        'marketplace_credentials_deleted',
        marketplace=marketplace.value,
        removed=removed,
    )
    return _build_connection_state(marketplace, None)


def _build_connection_state(
    marketplace: StockPlatform,
    record: dict[str, Any] | None,
) -> MarketplaceConnectionState:
    if record is None:
        return MarketplaceConnectionState(
            marketplace=marketplace,
            status=MarketplaceConnectionStatus.DISCONNECTED,
            connected=False,
        )

    status = MarketplaceConnectionStatus(
        record.get('status') or MarketplaceConnectionStatus.ERROR
    )
    error_payload = record.get('error')
    error = (
        MarketplaceValidationIssue(**error_payload)
        if isinstance(error_payload, dict)
        else None
    )

    return MarketplaceConnectionState(
        marketplace=marketplace,
        status=status,
        connected=status == MarketplaceConnectionStatus.CONNECTED,
        account_id=_normalize_optional_string(record.get('account_id')),
        credential_type=_normalize_optional_string(
            record.get('credential_type')
        ),
        secret_hint=_mask_secret(str(record.get('secret') or '')),
        last_validated_at=_parse_datetime(record.get('last_validated_at')),
        updated_at=_parse_datetime(record.get('updated_at')),
        error=error,
    )


def _load_credentials() -> dict[str, dict[str, Any]]:
    credentials_path = _get_credentials_path()

    if not credentials_path.is_file():
        return {}

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


def _write_credentials(records: dict[str, dict[str, Any]]) -> None:
    credentials_path = _get_credentials_path()
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


def _get_credentials_path() -> Path:
    runtime_directories = ensure_runtime_directories()
    return resolve_path_in_base(
        runtime_directories.workspace_dir,
        CREDENTIALS_FILENAME,
    )


def _mask_secret(secret: str) -> str | None:
    if not secret:
        return None

    if len(secret) <= 4:
        return '*' * len(secret)

    return f'***{secret[-4:]}'


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _normalize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    return normalized or None
