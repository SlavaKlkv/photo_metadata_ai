from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, SecretStr, field_validator

from app.core.enums import AIProvider


class AIProviderApiKeyProvider(StrEnum):
    GEMINI = AIProvider.GEMINI.value
    OPENROUTER = AIProvider.OPENROUTER.value


class AIProviderApiKeyValidationRequest(BaseModel):
    api_key: SecretStr

    @field_validator('api_key')
    @classmethod
    def validate_api_key(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError('api_key is required')

        return value


class AIProviderApiKeyValidationResponse(BaseModel):
    provider: AIProvider
    valid: bool
    status: Literal['valid', 'invalid']
    reason_code: str | None = None
    message: str
    saved: bool
