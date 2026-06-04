from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.enums import AIProvider

RuntimeProfile = Literal['server', 'desktop']

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT_CANDIDATE = BACKEND_DIR.parent
PROJECT_ROOT = (
    PROJECT_ROOT_CANDIDATE
    if (PROJECT_ROOT_CANDIDATE / '.env.example').is_file()
    else BACKEND_DIR
)
ROOT_ENV_FILE = PROJECT_ROOT / '.env' if PROJECT_ROOT != BACKEND_DIR else None


class Settings(BaseSettings):
    PROJECT_NAME: str = 'Photo Metadata AI'
    API_V1_STR: str = '/api/v1'

    # AI Providers Settings

    DEFAULT_AI_PROVIDER: AIProvider = AIProvider.OLLAMA

    OLLAMA_BASE_URL: str = 'http://localhost:11434'
    OLLAMA_MODEL: str = 'llava'
    OLLAMA_REQUIRED_MODEL: str = 'qwen2.5vl'

    GEMINI_API_KEY: str | None = None
    GEMINI_BASE_URL: str = 'https://generativelanguage.googleapis.com/v1beta'
    GEMINI_MODEL: str = 'gemini-2.5-flash'

    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_BASE_URL: str = 'https://openrouter.ai/api/v1'
    OPENROUTER_MODEL: str = 'openrouter/free'

    DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS: float = 8.0
    DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS: int = 2
    DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS: float = 0.5

    MAX_UPLOAD_FILE_SIZE_MB: int = Field(default=50, ge=1)
    AI_RESIZE_LONG_SIDE_PX: int = Field(default=1280, ge=1)
    AI_JPEG_QUALITY: int = Field(default=85, ge=1, le=100)

    BACKEND_RUNTIME_PROFILE: RuntimeProfile = 'desktop'
    WORKSPACE_DIR: Path = PROJECT_ROOT
    DESKTOP_WORKSPACE_DIR: Path | None = None

    CORS_ALLOW_ORIGINS: list[str] = ['*']
    CORS_ALLOW_METHODS: list[str] = ['*']
    CORS_ALLOW_HEADERS: list[str] = ['*']
    CORS_ALLOW_CREDENTIALS: bool = True

    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra='ignore')

    @field_validator('WORKSPACE_DIR', 'DESKTOP_WORKSPACE_DIR', mode='before')
    @classmethod
    def normalize_path(
        cls,
        value: str | Path | None,
    ) -> Path | None:
        if value is None:
            return None
        if isinstance(value, Path):
            path = value.expanduser()
        else:
            normalized = value.strip()
            if not normalized:
                return None

            path = Path(normalized).expanduser()

        if not path.is_absolute():
            return PROJECT_ROOT / path

        return path

    @property
    def runtime_profile(self) -> RuntimeProfile:
        return self.BACKEND_RUNTIME_PROFILE

    @property
    def workspace_root(self) -> Path:
        workspace_dir = self.WORKSPACE_DIR

        if (
            self.runtime_profile == 'desktop'
            and self.DESKTOP_WORKSPACE_DIR is not None
        ):
            workspace_dir = self.DESKTOP_WORKSPACE_DIR

        return workspace_dir.resolve(strict=False)


settings = Settings()
