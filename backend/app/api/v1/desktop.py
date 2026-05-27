from fastapi import APIRouter
from pydantic import BaseModel

from app.core.runtime import (
    ensure_runtime_directories,
    get_runtime_directories,
)
from app.schemas.provider_discovery import ProvidersDiscoveryResponse
from app.services.provider_discovery import discover_ai_providers

router = APIRouter(
    prefix='/desktop',
    tags=['desktop'],
)


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


def _build_runtime_info() -> DesktopRuntimeInfo:
    runtime_directories = get_runtime_directories()

    directories_ready = all(
        path.exists()
        for path in [
            runtime_directories.workspace_dir,
            runtime_directories.jobs_dir,
            runtime_directories.results_dir,
            runtime_directories.temp_dir,
        ]
    )

    return DesktopRuntimeInfo(
        runtime_profile=runtime_directories.profile,
        workspace_dir=str(runtime_directories.workspace_dir),
        jobs_dir=str(runtime_directories.jobs_dir),
        results_dir=str(runtime_directories.results_dir),
        temp_dir=str(runtime_directories.temp_dir),
        directories_ready=directories_ready,
    )


@router.get('/health', response_model=DesktopHealthResponse)
async def desktop_health_check():
    runtime_directories = ensure_runtime_directories()
    return DesktopHealthResponse(
        status='ok',
        runtime_profile=runtime_directories.profile,
    )


@router.get('/runtime', response_model=DesktopRuntimeInfo)
async def get_desktop_runtime_info():
    ensure_runtime_directories()
    return _build_runtime_info()


@router.get(
    '/providers/discovery',
    response_model=ProvidersDiscoveryResponse,
)
async def discover_desktop_ai_providers():
    return await discover_ai_providers()
