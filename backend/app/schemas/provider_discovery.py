from pydantic import BaseModel, Field


class ProviderLink(BaseModel):
    label: str
    url: str


class ProviderDiscoveryItem(BaseModel):
    provider: str
    display_name: str
    ready: bool
    status: str
    reason_code: str | None = None
    reason: str | None = None
    configured: bool
    local: bool
    model: str | None = None
    setup_links: list[ProviderLink] = Field(default_factory=list)
    api_key_links: list[ProviderLink] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)


class ProvidersDiscoveryResponse(BaseModel):
    providers: list[ProviderDiscoveryItem] = Field(default_factory=list)
    ready_providers: list[str] = Field(default_factory=list)
    recommended_provider: str | None = None
    has_ready_provider: bool = False
    hints: list[str] = Field(default_factory=list)
