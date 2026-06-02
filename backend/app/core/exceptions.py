class DomainError(Exception):
    """
    Базовая ошибка доменного уровня для application services.
    """

    def __init__(self, message: str, *, reason_code: str | None = None):
        super().__init__(message)
        self.reason_code = reason_code


class AIProviderError(DomainError):
    def __init__(self, reason_code: str, message: str):
        super().__init__(message, reason_code=reason_code)


class AIProviderConfigurationError(AIProviderError):
    """
    Провайдер нельзя использовать из-за отсутствующей или невалидной настройки.
    """


class AIProviderRuntimeError(AIProviderError):
    """
    Провайдер завершился ошибкой во время генерации metadata.
    """


class UploadValidationError(DomainError):
    """
    Загруженный файл не прошел доменную валидацию.
    """
