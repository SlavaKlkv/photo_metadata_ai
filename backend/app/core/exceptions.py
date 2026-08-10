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


class UnsupportedImageFormatError(UploadValidationError):
    """
    Файл распознан Pillow, но его формат не поддерживается.

    Несёт фактический формат, чтобы причину отказа можно было залогировать.
    """

    def __init__(self, image_format: str):
        super().__init__(
            f'Unsupported image format: {image_format}',
            reason_code='unsupported_image_format',
        )
        self.image_format = image_format
