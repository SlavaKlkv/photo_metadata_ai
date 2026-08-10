from app.core.enums import AIProvider

ALLOWED_DESKTOP_OPEN_FILE_SUFFIXES = {
    '.csv',
    '.iptc',
    '.jpg',
    '.jpeg',
    '.zip',
}

AI_PROVIDER_API_KEY_VALIDATION_TIMEOUT_SECONDS = 3.0
SUPPORTED_AI_API_KEY_PROVIDERS = {
    AIProvider.GEMINI,
    AIProvider.OPENROUTER,
}
AI_PROVIDER_API_KEY_ENV_VARS = {
    AIProvider.GEMINI: 'GEMINI_API_KEY',
    AIProvider.OPENROUTER: 'OPENROUTER_API_KEY',
}
