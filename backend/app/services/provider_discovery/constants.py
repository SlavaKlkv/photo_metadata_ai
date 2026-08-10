from app.schemas.provider_discovery import ProviderLink

DISCOVERY_TIMEOUT_SECONDS = 3.0

OLLAMA_INSTALL_LINK = ProviderLink(
    label='Ollama install guide',
    url='https://ollama.com/download',
)
OLLAMA_MODEL_LINK = ProviderLink(
    label='Ollama model library',
    url='https://ollama.com/library',
)
GEMINI_API_KEY_LINK = ProviderLink(
    label='Get Gemini API key',
    url='https://aistudio.google.com/app/apikey',
)
OPENROUTER_API_KEY_LINK = ProviderLink(
    label='Get OpenRouter API key',
    url='https://openrouter.ai/keys',
)
