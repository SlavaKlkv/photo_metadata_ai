from pydantic import BaseModel

from app.core.enums import AIProvider


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


class DesktopSettingsResponse(BaseModel):
    selected_provider: AIProvider
    effective_provider: AIProvider
    effective_model: str | None = None


class UpdateDesktopSettingsRequest(BaseModel):
    selected_provider: AIProvider
