from datetime import UTC, datetime

from pydantic import BaseModel, Field, SecretStr, model_validator

from app.core.enums import MarketplaceConnectionStatus, StockPlatform


class MarketplaceCredentialsRequest(BaseModel):
    """
    Credentials payload accepted from onboarding/settings UI.
    """

    api_key: SecretStr | None = None
    token: SecretStr | None = None
    account_id: str | None = None

    @model_validator(mode='after')
    def require_secret(self):
        if self.api_key is None and self.token is None:
            raise ValueError('api_key or token is required')

        return self


class MarketplaceValidationError(BaseModel):
    code: str
    message: str


class MarketplaceConnectionState(BaseModel):
    marketplace: StockPlatform
    status: MarketplaceConnectionStatus
    connected: bool
    account_id: str | None = None
    credential_type: str | None = None
    secret_hint: str | None = None
    last_validated_at: datetime | None = None
    updated_at: datetime | None = None
    error: MarketplaceValidationError | None = None


class MarketplaceConnectionsResponse(BaseModel):
    connections: list[MarketplaceConnectionState] = Field(default_factory=list)


class MarketplaceValidationResponse(BaseModel):
    marketplace: StockPlatform
    valid: bool
    status: MarketplaceConnectionStatus
    account_id: str | None = None
    error: MarketplaceValidationError | None = None
    validated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MarketplaceCredentialsStoredResponse(BaseModel):
    connection: MarketplaceConnectionState
