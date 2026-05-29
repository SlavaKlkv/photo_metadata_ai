from pydantic import BaseModel


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
