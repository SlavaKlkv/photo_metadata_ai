from app.core.enums import AIProvider

AI_PROVIDER_TIMEOUT = 120

FALLBACK_CHAINS: dict[AIProvider, tuple[AIProvider, ...]] = {
    AIProvider.OLLAMA: (
        AIProvider.OLLAMA,
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
    ),
    AIProvider.GEMINI: (
        AIProvider.GEMINI,
        AIProvider.OPENROUTER,
        AIProvider.OLLAMA,
    ),
    AIProvider.OPENROUTER: (
        AIProvider.OPENROUTER,
        AIProvider.GEMINI,
        AIProvider.OLLAMA,
    ),
    AIProvider.MOCK: (AIProvider.MOCK,),
}
