from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.core.enums import AIProvider
from app.core.runtime import (
    ensure_runtime_directories,
    get_runtime_directories,
)
from app.schemas.ai_provider_api_key import (
    AIProviderApiKeyProvider,
    AIProviderApiKeyValidationRequest,
    AIProviderApiKeyValidationResponse,
)
from app.schemas.desktop import (
    DesktopActionResponse,
    DesktopHealthResponse,
    DesktopRuntimeInfo,
    DesktopSettingsResponse,
    DesktopStartupStatusResponse,
    DesktopUpdateCheckResponse,
    UpdateDesktopSettingsRequest,
)
from app.schemas.provider_discovery import ProvidersDiscoveryResponse
from app.services.desktop.ai_provider_api_keys import (
    validate_and_save_ai_provider_api_key,
)
from app.services.desktop.app_settings import (
    get_desktop_settings,
    update_desktop_settings,
)
from app.services.desktop.app_updates import check_for_updates
from app.services.desktop.desktop_open import (
    get_job_result_file_path,
    get_job_results_dir,
    open_path_in_default_app,
)
from app.services.desktop.desktop_startup import get_desktop_startup_status
from app.services.provider_discovery.provider_discovery import (
    discover_ai_providers,
)

router = APIRouter(
    prefix='/desktop',
    tags=['desktop'],
)


@router.get('/health', response_model=DesktopHealthResponse)
async def desktop_health_check():
    """
    Проверяет доступность десктопного окружения.
    """
    runtime_directories = ensure_runtime_directories()
    return DesktopHealthResponse(
        status='ok',
        runtime_profile=runtime_directories.profile,
    )


@router.get('/runtime', response_model=DesktopRuntimeInfo)
async def get_desktop_runtime_info():
    """
    Возвращает информацию о директориях десктопного окружения.
    """
    ensure_runtime_directories()
    return _build_runtime_info()


@router.get('/settings', response_model=DesktopSettingsResponse)
async def get_settings():
    """
    Возвращает сохраненные настройки десктопного окружения.
    """
    return get_desktop_settings()


@router.patch('/settings', response_model=DesktopSettingsResponse)
async def update_settings(payload: UpdateDesktopSettingsRequest):
    """
    Обновляет настройки десктопного окружения.
    """
    return update_desktop_settings(
        payload.selected_provider,
        payload.disabled_providers,
    )


@router.get('/updates', response_model=DesktopUpdateCheckResponse)
async def check_desktop_updates(force: bool = False):
    """
    Проверяет наличие новой версии приложения в GitHub Releases.
    """
    return await check_for_updates(force_refresh=force)


@router.get('/startup/status', response_model=DesktopStartupStatusResponse)
async def get_desktop_startup_status_endpoint():
    """
    Возвращает состояние запуска десктопного окружения.
    """
    return get_desktop_startup_status()


@router.post(
    '/jobs/{job_id}/open-results-folder',
    response_model=DesktopActionResponse,
)
async def open_results_folder(job_id: UUID):
    """
    Открывает директорию результатов задачи в системном файловом менеджере.
    """
    action = 'open_results_folder'

    try:
        results_dir = get_job_results_dir(job_id)
    except ValueError:
        return _build_error_response(
            action=action,
            status_code=400,
            code='PATH_POLICY_VIOLATION',
            message='Path is outside allowed results directory',
        )

    if not results_dir.is_dir():
        return _build_error_response(
            action=action,
            status_code=404,
            code='RESULTS_DIR_NOT_FOUND',
            message='Results directory not found',
        )

    try:
        await run_in_threadpool(open_path_in_default_app, results_dir)
    except FileNotFoundError:
        return _build_error_response(
            action=action,
            status_code=500,
            code='OPEN_COMMAND_NOT_FOUND',
            message='System open command is not available',
        )
    except OSError:
        return _build_error_response(
            action=action,
            status_code=500,
            code='OPEN_FOLDER_FAILED',
            message='Failed to open results directory',
        )

    return DesktopActionResponse(
        status='ok',
        action=action,
        message='Results directory opened',
        path=str(results_dir),
    )


@router.post(
    '/jobs/{job_id}/open-result-file',
    response_model=DesktopActionResponse,
)
async def open_result_file(
    job_id: UUID,
    filename: str,
):
    """
    Открывает файл результата задачи в приложении по умолчанию.
    """
    action = 'open_result_file'

    try:
        file_path = get_job_result_file_path(job_id, filename)
    except ValueError as error:
        error_code = str(error)

        if error_code == 'unsupported_file_type':
            return _build_error_response(
                action=action,
                status_code=400,
                code='UNSUPPORTED_FILE_TYPE',
                message='Only CSV, IPTC, JPG and ZIP files are allowed',
            )

        return _build_error_response(
            action=action,
            status_code=400,
            code='PATH_POLICY_VIOLATION',
            message='Path is outside allowed results directory',
        )

    if not file_path.is_file():
        return _build_error_response(
            action=action,
            status_code=404,
            code='RESULT_FILE_NOT_FOUND',
            message='Result file not found',
        )

    try:
        await run_in_threadpool(open_path_in_default_app, file_path)
    except FileNotFoundError:
        return _build_error_response(
            action=action,
            status_code=500,
            code='OPEN_COMMAND_NOT_FOUND',
            message='System open command is not available',
        )
    except OSError:
        return _build_error_response(
            action=action,
            status_code=500,
            code='OPEN_FILE_FAILED',
            message='Failed to open result file',
        )

    return DesktopActionResponse(
        status='ok',
        action=action,
        message='Result file opened',
        path=str(file_path),
    )


@router.get(
    '/providers/discovery',
    response_model=ProvidersDiscoveryResponse,
)
async def discover_desktop_ai_providers():
    """
    Возвращает доступность AI-провайдеров для десктопного окружения.
    """
    return await discover_ai_providers()


@router.post(
    '/ai-providers/{provider}/api-key/validate-and-save',
    response_model=AIProviderApiKeyValidationResponse,
)
async def validate_and_save_desktop_ai_provider_api_key(
    provider: AIProviderApiKeyProvider,
    payload: AIProviderApiKeyValidationRequest,
):
    """Валидирует и сохраняет API-ключ в десктопном окружении."""
    try:
        return await validate_and_save_ai_provider_api_key(
            AIProvider(provider.value),
            payload.api_key,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error


def _build_runtime_info() -> DesktopRuntimeInfo:
    runtime_directories = get_runtime_directories()

    directories_ready = all(
        path.exists()
        for path in [
            runtime_directories.workspace_dir,
            runtime_directories.desktop_storage_dir,
            runtime_directories.jobs_dir,
            runtime_directories.results_dir,
            runtime_directories.temp_dir,
        ]
    )

    return DesktopRuntimeInfo(
        runtime_profile=runtime_directories.profile,
        workspace_dir=str(runtime_directories.workspace_dir),
        desktop_storage_dir=str(runtime_directories.desktop_storage_dir),
        jobs_dir=str(runtime_directories.jobs_dir),
        results_dir=str(runtime_directories.results_dir),
        temp_dir=str(runtime_directories.temp_dir),
        directories_ready=directories_ready,
    )


def _build_error_response(
    action: str,
    status_code: int,
    code: str,
    message: str,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=DesktopActionResponse(
            status='error',
            action=action,
            code=code,
            message=message,
        ).model_dump(),
    )
