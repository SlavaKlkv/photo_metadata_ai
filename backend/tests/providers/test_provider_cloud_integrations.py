from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.services.ai.ai_provider import (
    GeminiImageMetadataProvider,
    OpenRouterImageMetadataProvider,
)
from app.services.prompt_templates.constants import (
    DEFAULT_PROMPT_LANGUAGE,
    METADATA_PROMPT_TEMPLATE_VERSION,
)


@pytest.mark.asyncio
async def test_gemini_provider_uses_configured_model_and_parses_metadata(
    monkeypatch,
    tmp_path: Path,
):
    captured_request: httpx.Request | None = None
    image_path = tmp_path / 'image.jpg'
    image_path.write_bytes(b'test image bytes')

    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'gemini-secret')
    monkeypatch.setattr(settings, 'GEMINI_MODEL', 'gemini-test-model')

    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            200,
            json={
                'candidates': [
                    {
                        'content': {
                            'parts': [
                                {
                                    'text': (
                                        '{"title":"Gemini title",'
                                        '"description":"Gemini description",'
                                        '"keywords":["gemini","metadata"],'
                                        '"categories":["Nature"]}'
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    metadata = await GeminiImageMetadataProvider().generate_metadata(
        image_path
    )

    assert captured_request is not None
    assert str(captured_request.url).endswith(
        '/models/gemini-test-model:generateContent'
    )
    assert captured_request.headers['x-goog-api-key'] == 'gemini-secret'
    assert metadata.title == 'Gemini title'
    assert metadata.description == 'Gemini description'
    assert metadata.keywords == ['gemini', 'metadata']
    assert metadata.categories == ['Nature']
    assert metadata.prompt_version == METADATA_PROMPT_TEMPLATE_VERSION
    assert metadata.prompt_language == DEFAULT_PROMPT_LANGUAGE


@pytest.mark.asyncio
async def test_openrouter_provider_uses_configured_model_and_parses_metadata(
    monkeypatch,
    tmp_path: Path,
):
    captured_payload: bytes | None = None
    captured_headers: httpx.Headers | None = None
    image_path = tmp_path / 'image.jpg'
    image_path.write_bytes(b'test image bytes')

    monkeypatch.setattr(settings, 'OPENROUTER_API_KEY', 'openrouter-secret')
    monkeypatch.setattr(settings, 'OPENROUTER_MODEL', 'openrouter/test-model')

    async_client = httpx.AsyncClient

    async def request_handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_payload, captured_headers
        captured_payload = request.read()
        captured_headers = request.headers
        return httpx.Response(
            200,
            json={
                'choices': [
                    {
                        'message': {
                            'content': (
                                '{"title":"OpenRouter title",'
                                '"description":"OpenRouter description",'
                                '"keywords":["openrouter","metadata"],'
                                '"categories":["Travel"]}'
                            )
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(
        httpx,
        'AsyncClient',
        lambda **kwargs: async_client(
            transport=httpx.MockTransport(request_handler),
            **kwargs,
        ),
    )

    metadata = await OpenRouterImageMetadataProvider().generate_metadata(
        image_path
    )

    assert captured_headers is not None
    assert captured_headers['Authorization'] == 'Bearer openrouter-secret'
    assert captured_payload is not None
    assert b'"model":"openrouter/test-model"' in captured_payload
    assert b'data:image/jpeg;base64,' in captured_payload
    assert metadata.title == 'OpenRouter title'
    assert metadata.description == 'OpenRouter description'
    assert metadata.keywords == ['openrouter', 'metadata']
    assert metadata.categories == ['Travel']
    assert metadata.prompt_version == METADATA_PROMPT_TEMPLATE_VERSION
    assert metadata.prompt_language == DEFAULT_PROMPT_LANGUAGE
