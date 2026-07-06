from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.enums import MarketplaceConnectionStatus, StockPlatform
from app.schemas.marketplace import (
    MarketplaceCredentialsRequest,
    MarketplaceValidationIssue,
    MarketplaceValidationResponse,
)


@dataclass(frozen=True)
class MarketplaceCredentialMaterial:
    credential_type: str
    secret: str
    account_id: str | None


def extract_credential_material(
    credentials: MarketplaceCredentialsRequest,
) -> MarketplaceCredentialMaterial:
    if credentials.api_key is not None:
        return MarketplaceCredentialMaterial(
            credential_type='api_key',
            secret=credentials.api_key.get_secret_value(),
            account_id=credentials.account_id,
        )

    if credentials.token is not None:
        return MarketplaceCredentialMaterial(
            credential_type='token',
            secret=credentials.token.get_secret_value(),
            account_id=credentials.account_id,
        )

    raise ValueError('api_key or token is required')


async def validate_marketplace_credentials(
    marketplace: StockPlatform,
    credentials: MarketplaceCredentialsRequest,
) -> MarketplaceValidationResponse:
    """
    Validates marketplace credentials through a marketplace-specific layer.

    The current implementation is deterministic and local. It intentionally
    avoids real marketplace API calls until concrete marketplace integrations
    are added.
    """
    material = extract_credential_material(credentials)
    validator = _get_marketplace_validator(marketplace)
    return await validator.validate(material)


class MarketplaceCredentialValidator:
    def __init__(self, marketplace: StockPlatform):
        self.marketplace = marketplace

    async def validate(
        self,
        material: MarketplaceCredentialMaterial,
    ) -> MarketplaceValidationResponse:
        secret = material.secret.strip()
        account_id = _normalize_account_id(material.account_id)

        if len(secret) < 8:
            return _build_invalid_response(
                marketplace=self.marketplace,
                account_id=account_id,
                code='credential_too_short',
                message='Credential value is too short.',
            )

        if secret.lower().startswith(('invalid', 'test-invalid')):
            return _build_invalid_response(
                marketplace=self.marketplace,
                account_id=account_id,
                code='credential_rejected',
                message='Marketplace rejected the provided credentials.',
            )

        return MarketplaceValidationResponse(
            marketplace=self.marketplace,
            valid=True,
            status=MarketplaceConnectionStatus.CONNECTED,
            account_id=account_id,
            validated_at=datetime.now(UTC),
        )


def _get_marketplace_validator(
    marketplace: StockPlatform,
) -> MarketplaceCredentialValidator:
    return MarketplaceCredentialValidator(marketplace)


def _normalize_account_id(account_id: str | None) -> str | None:
    if account_id is None:
        return None

    normalized = account_id.strip()
    return normalized or None


def _build_invalid_response(
    *,
    marketplace: StockPlatform,
    account_id: str | None,
    code: str,
    message: str,
) -> MarketplaceValidationResponse:
    return MarketplaceValidationResponse(
        marketplace=marketplace,
        valid=False,
        status=MarketplaceConnectionStatus.ERROR,
        account_id=account_id,
        error=MarketplaceValidationIssue(
            code=code,
            message=message,
        ),
        validated_at=datetime.now(UTC),
    )
