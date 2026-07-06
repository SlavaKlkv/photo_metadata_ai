from pydantic import BaseModel, Field


class ProviderLink(BaseModel):
    label: str
    url: str


class ProviderApiKeyPrefill(BaseModel):
    available: bool = False
    source: str | None = None
    env_var: str | None = None
    display_value: str | None = None
    read_only: bool = False
    editable: bool = True
    reset_required_to_edit: bool = False


class ProviderApiKeyValidation(BaseModel):
    required: bool = False
    trigger: str = 'manual'
    status: str = 'not_started'
    error_message: str | None = None


class ProviderOnboardingState(BaseModel):
    step: int = 3
    ready: bool
    input_mode: str
    manual_input_required: bool
    api_key_detected: bool = False
    notify_detected_api_key: bool = False
    detected_api_key_provider: str | None = None
    detected_api_key_source: str | None = None
    recommendation: str | None = None
    prefill: ProviderApiKeyPrefill | None = None
    validation: ProviderApiKeyValidation = Field(
        default_factory=ProviderApiKeyValidation,
    )
    hints: list[str] = Field(default_factory=list)


class ProviderDiscoveryItem(BaseModel):
    provider: str
    display_name: str
    ready: bool
    status: str
    source: str | None = None
    reason_code: str | None = None
    reason: str | None = None
    configured: bool
    local: bool
    model: str | None = None
    setup_links: list[ProviderLink] = Field(default_factory=list)
    api_key_links: list[ProviderLink] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    onboarding: ProviderOnboardingState | None = None


class ProvidersDiscoveryResponse(BaseModel):
    providers: list[ProviderDiscoveryItem] = Field(default_factory=list)
    ready_providers: list[str] = Field(default_factory=list)
    recommended_provider: str | None = None
    has_ready_provider: bool = False
    has_detected_cloud_api_key: bool = False
    detected_cloud_api_key_providers: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
