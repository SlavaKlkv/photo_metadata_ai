from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = 'Photo Metadata AI'
    API_V1_STR: str = '/api/v1'

    # AI Providers Settings
    DEFAULT_AI_PROVIDER: str = 'openai'
    CLAUDE_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    OLLAMA_BASE_URL: str = 'http://localhost:11434'

    class Config:
        env_file = '.env'


settings = Settings()
