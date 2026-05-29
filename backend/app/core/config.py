from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.enums import AIProvider

RuntimeProfile = Literal['server', 'desktop']


class Settings(BaseSettings):
    PROJECT_NAME: str = 'Photo Metadata AI'
    API_V1_STR: str = '/api/v1'

    # AI Providers Settings

    DEFAULT_AI_PROVIDER: AIProvider = AIProvider.OLLAMA

    CLAUDE_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_MODEL: str = 'openrouter/auto'

    OPENAI_API_KEY: str | None = None

    OLLAMA_BASE_URL: str = 'http://localhost:11434'
    OLLAMA_MODEL: str = 'llava'
    OLLAMA_REQUIRED_MODEL: str = 'qwen2.5vl'

    BACKEND_RUNTIME_PROFILE: RuntimeProfile = 'desktop'
    WORKSPACE_DIR: Path = Path.cwd()
    DESKTOP_WORKSPACE_DIR: Path | None = None

    CORS_ALLOW_ORIGINS: list[str] = ['*']
    CORS_ALLOW_METHODS: list[str] = ['*']
    CORS_ALLOW_HEADERS: list[str] = ['*']
    CORS_ALLOW_CREDENTIALS: bool = True

    model_config = SettingsConfigDict(env_file='.env')

    @field_validator('WORKSPACE_DIR', 'DESKTOP_WORKSPACE_DIR', mode='before')
    @classmethod
    def normalize_path(
        cls,
        value: str | Path | None,
    ) -> Path | None:
        if value is None:
            return None
        if isinstance(value, Path):
            return value.expanduser()

        normalized = value.strip()
        if not normalized:
            return None

        return Path(normalized).expanduser()

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
