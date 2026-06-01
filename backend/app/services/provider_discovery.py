from typing import Any

import httpx
import structlog

from app.core.config import settings
from app.schemas.provider_discovery import (
    ProviderApiKeyPrefill,
    ProviderApiKeyValidation,
    ProviderDiscoveryItem,
    ProviderLink,
    ProviderOnboardingState,
    ProvidersDiscoveryResponse,
)

logger = structlog.get_logger(__name__)

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


async def discover_ai_providers() -> ProvidersDiscoveryResponse:
    providers = [
        await _discover_ollama_provider(),
        _discover_gemini_provider(),
        _discover_openrouter_provider(),
    ]
    ready_providers = [
        provider.provider for provider in providers if provider.ready
    ]
    recommended_provider = _select_recommended_provider(providers)
    detected_cloud_api_key_providers = [
        provider.provider
        for provider in providers
        if provider.onboarding is not None
        and provider.onboarding.api_key_detected
        and not provider.local
    ]

    hints = [
        'Use a local provider for private desktop processing.'
        if recommended_provider == 'ollama'
        else 'Configure at least one AI provider before processing images.'
    ]

    return ProvidersDiscoveryResponse(
        providers=providers,
        ready_providers=ready_providers,
        recommended_provider=recommended_provider,
        has_ready_provider=bool(ready_providers),
        has_detected_cloud_api_key=bool(detected_cloud_api_key_providers),
        detected_cloud_api_key_providers=detected_cloud_api_key_providers,
        hints=hints,
    )


async def _discover_ollama_provider() -> ProviderDiscoveryItem:
    logger.info(
        'ollama_provider_discovery_started',
        base_url=settings.OLLAMA_BASE_URL,
        required_model=settings.OLLAMA_REQUIRED_MODEL,
    )

    try:
        async with httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL,
            timeout=DISCOVERY_TIMEOUT_SECONDS,
        ) as client:
            response = await client.get('/api/tags')
            response.raise_for_status()
    except httpx.HTTPError as error:
        logger.info(
            'ollama_provider_discovery_failed',
            reason_code='ollama_runtime_unavailable',
            error=str(error),
        )
        return ProviderDiscoveryItem(
            provider='ollama',
            display_name='Ollama qwen2.5vl',
            ready=False,
            status='not_ready',
            reason_code='ollama_runtime_unavailable',
            reason='Ollama runtime is not reachable.',
            configured=True,
            local=True,
            model=settings.OLLAMA_REQUIRED_MODEL,
            setup_links=[OLLAMA_INSTALL_LINK, OLLAMA_MODEL_LINK],
            hints=[
                'Install Ollama and start the local runtime.',
                f'Run: ollama pull {settings.OLLAMA_REQUIRED_MODEL}',
            ],
        )

    payload = response.json()
    installed_models = _extract_ollama_model_names(payload)

    if settings.OLLAMA_REQUIRED_MODEL not in installed_models:
        logger.info(
            'ollama_provider_model_missing',
            required_model=settings.OLLAMA_REQUIRED_MODEL,
            installed_models_count=len(installed_models),
        )
        return ProviderDiscoveryItem(
            provider='ollama',
            display_name='Ollama qwen2.5vl',
            ready=False,
            status='not_ready',
            reason_code='ollama_model_missing',
            reason='Required Ollama model is not installed.',
            configured=True,
            local=True,
            model=settings.OLLAMA_REQUIRED_MODEL,
            setup_links=[OLLAMA_INSTALL_LINK, OLLAMA_MODEL_LINK],
            hints=[f'Run: ollama pull {settings.OLLAMA_REQUIRED_MODEL}'],
        )

    logger.info(
        'ollama_provider_discovery_completed',
        required_model=settings.OLLAMA_REQUIRED_MODEL,
    )
    return ProviderDiscoveryItem(
        provider='ollama',
        display_name='Ollama qwen2.5vl',
        ready=True,
        status='ready',
        configured=True,
        local=True,
        model=settings.OLLAMA_REQUIRED_MODEL,
        setup_links=[OLLAMA_INSTALL_LINK, OLLAMA_MODEL_LINK],
        hints=['Local AI provider is ready for desktop processing.'],
    )


def _discover_gemini_provider() -> ProviderDiscoveryItem:
    return _discover_api_key_provider(
        provider='gemini',
        display_name='Gemini',
        api_key=settings.GEMINI_API_KEY,
        api_key_env_var='GEMINI_API_KEY',
        model=None,
        api_key_link=GEMINI_API_KEY_LINK,
        missing_reason_code='gemini_api_key_missing',
        missing_reason='Gemini API key is not configured.',
        ready_hint='Gemini API key is configured.',
        setup_hint='Add GEMINI_API_KEY to backend environment settings.',
    )


def _discover_openrouter_provider() -> ProviderDiscoveryItem:
    return _discover_api_key_provider(
        provider='openrouter',
        display_name='OpenRouter',
        api_key=settings.OPENROUTER_API_KEY,
        api_key_env_var='OPENROUTER_API_KEY',
        model=settings.OPENROUTER_MODEL,
        api_key_link=OPENROUTER_API_KEY_LINK,
        missing_reason_code='openrouter_api_key_missing',
        missing_reason='OpenRouter API key is not configured.',
        ready_hint='OpenRouter API key is configured.',
        setup_hint='Add OPENROUTER_API_KEY to backend environment settings.',
    )


def _discover_api_key_provider(
    *,
    provider: str,
    display_name: str,
    api_key: str | None,
    api_key_env_var: str,
    model: str | None,
    api_key_link: ProviderLink,
    missing_reason_code: str,
    missing_reason: str,
    ready_hint: str,
    setup_hint: str,
) -> ProviderDiscoveryItem:
    configured = bool(api_key)

    if configured:
        recommendation = (
            f'Use the detected {display_name} API key from {api_key_env_var}.'
        )
        return ProviderDiscoveryItem(
            provider=provider,
            display_name=display_name,
            ready=True,
            status='ready',
            configured=True,
            local=False,
            model=model,
            api_key_links=[api_key_link],
            hints=[ready_hint, recommendation],
            onboarding=ProviderOnboardingState(
                ready=True,
                input_mode='prefill_read_only',
                manual_input_required=False,
                api_key_detected=True,
                notify_detected_api_key=True,
                detected_api_key_provider=provider,
                detected_api_key_source='environment',
                recommendation=recommendation,
                prefill=ProviderApiKeyPrefill(
                    available=True,
                    source='environment',
                    env_var=api_key_env_var,
                    display_value=f'Configured {api_key_env_var}',
                    read_only=True,
                    editable=False,
                    reset_required_to_edit=True,
                ),
                validation=ProviderApiKeyValidation(
                    required=True,
                    trigger='automatic',
                    status='pending',
                ),
                hints=[
                    'Show the detected key in a read-only prefill field.',
                    'Start validation automatically after prefill.',
                    'Allow manual editing only after explicit key reset.',
                ],
            ),
        )

    return ProviderDiscoveryItem(
        provider=provider,
        display_name=display_name,
        ready=False,
        status='not_ready',
        reason_code=missing_reason_code,
        reason=missing_reason,
        configured=False,
        local=False,
        model=model,
        api_key_links=[api_key_link],
        hints=[setup_hint],
        onboarding=ProviderOnboardingState(
            ready=False,
            input_mode='manual',
            manual_input_required=True,
            api_key_detected=False,
            notify_detected_api_key=False,
            prefill=ProviderApiKeyPrefill(
                available=False,
                read_only=False,
                editable=True,
            ),
            validation=ProviderApiKeyValidation(
                required=True,
                trigger='manual',
                status='missing',
                error_message='invalid key',
            ),
            hints=[
                setup_hint,
                'Show an editable field for pasting an API key.',
                'Display "invalid key" when key validation fails.',
            ],
        ),
    )


def _extract_ollama_model_names(payload: dict[str, Any]) -> set[str]:
    models = payload.get('models')

    if not isinstance(models, list):
        return set()

    model_names: set[str] = set()

    for model in models:
        if not isinstance(model, dict):
            continue

        name = model.get('name')
        if isinstance(name, str):
            model_names.add(name)
            model_names.add(name.split(':', maxsplit=1)[0])

        model_id = model.get('model')
        if isinstance(model_id, str):
            model_names.add(model_id)
            model_names.add(model_id.split(':', maxsplit=1)[0])

    return model_names


def _select_recommended_provider(
    providers: list[ProviderDiscoveryItem],
) -> str | None:
    provider_by_name = {provider.provider: provider for provider in providers}

    for provider_name in ('ollama', 'gemini', 'openrouter'):
        provider = provider_by_name.get(provider_name)
        if provider is not None and provider.ready:
            return provider.provider

    return None
