from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.provider_discovery import ProvidersDiscoveryResponse


class DesktopRuntimeInfo(BaseModel):
    runtime_profile: str
    workspace_dir: str
    jobs_dir: str
    results_dir: str
    temp_dir: str
    directories_ready: bool


class DesktopHealthResponse(BaseModel):
    status: str
    runtime_profile: str


class DesktopActionResponse(BaseModel):
    status: str
    action: str
    message: str
    code: str | None = None
    path: str | None = None


class DesktopStartupStatusResponse(BaseModel):
    status: Literal['ready', 'degraded', 'not_ready']
    phase: Literal['pending', 'checking', 'completed', 'failed']
    providers: ProvidersDiscoveryResponse | None = None
    ready_providers: list[str] = Field(default_factory=list)
    recommended_provider: str | None = None
    has_ready_provider: bool = False
    reason_codes: list[str] = Field(default_factory=list)
    degradation_reasons: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    attempts: int
    max_attempts: int
    timeout_seconds: float
    retry_delay_seconds: float
    message: str
