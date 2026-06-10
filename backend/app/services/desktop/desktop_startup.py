import asyncio
from contextlib import suppress
from datetime import UTC, datetime
from typing import Literal

import structlog

from app.core.config import settings
from app.schemas.desktop import DesktopStartupStatusResponse
from app.schemas.provider_discovery import ProvidersDiscoveryResponse
from app.services.provider_discovery.provider_discovery import (
    discover_ai_providers,
)

logger = structlog.get_logger(__name__)

StartupStatus = Literal['ready', 'degraded', 'not_ready']


class DesktopStartupOrchestrator:
    def __init__(self) -> None:
        self._task: asyncio.Task[DesktopStartupStatusResponse] | None = None
        self._last_status = self._build_initial_status()

    def start(self) -> None:
        if settings.runtime_profile != 'desktop':
            logger.info(
                'desktop_startup_orchestration_skipped',
                reason='runtime_profile_not_desktop',
                runtime_profile=settings.runtime_profile,
            )
            return

        if self._task is not None and not self._task.done():
            logger.info('desktop_startup_orchestration_already_running')
            return

        self._last_status = self._build_initial_status()
        self._task = asyncio.create_task(self.run_checks())
        logger.info(
            'desktop_startup_orchestration_scheduled',
            timeout_seconds=settings.DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS,
            retry_attempts=settings.DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS,
            retry_delay_seconds=(
                settings.DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS
            ),
        )

    async def stop(self) -> None:
        if self._task is None or self._task.done():
            return

        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task

        logger.info('desktop_startup_orchestration_cancelled')

    async def run_checks(self) -> DesktopStartupStatusResponse:
        started_at = _utc_now()
        timeout_seconds = settings.DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS
        retry_attempts = max(
            1,
            settings.DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS,
        )
        retry_delay_seconds = (
            settings.DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS
        )

        self._last_status = DesktopStartupStatusResponse(
            status='not_ready',
            phase='checking',
            started_at=started_at,
            attempts=0,
            max_attempts=retry_attempts,
            timeout_seconds=timeout_seconds,
            retry_delay_seconds=retry_delay_seconds,
            message='AI readiness checks are running.',
            hints=['Waiting for startup diagnostics to complete.'],
        )

        logger.info(
            'desktop_startup_ai_readiness_started',
            timeout_seconds=timeout_seconds,
            retry_attempts=retry_attempts,
            retry_delay_seconds=retry_delay_seconds,
        )

        last_error: Exception | None = None

        for attempt in range(1, retry_attempts + 1):
            logger.info(
                'desktop_startup_ai_readiness_attempt_started',
                attempt=attempt,
                max_attempts=retry_attempts,
            )

            try:
                providers = await asyncio.wait_for(
                    discover_ai_providers(),
                    timeout=timeout_seconds,
                )
            except TimeoutError as error:
                last_error = error
                logger.info(
                    'desktop_startup_ai_readiness_attempt_failed',
                    attempt=attempt,
                    max_attempts=retry_attempts,
                    reason_code='startup_ai_readiness_timeout',
                    timeout_seconds=timeout_seconds,
                )
            except Exception as error:
                last_error = error
                logger.info(
                    'desktop_startup_ai_readiness_attempt_failed',
                    attempt=attempt,
                    max_attempts=retry_attempts,
                    reason_code='startup_ai_readiness_error',
                    error=str(error),
                )
            else:
                status = _aggregate_startup_status(
                    providers=providers,
                    started_at=started_at,
                    attempts=attempt,
                    max_attempts=retry_attempts,
                    timeout_seconds=timeout_seconds,
                    retry_delay_seconds=retry_delay_seconds,
                )
                self._last_status = status
                logger.info(
                    'desktop_startup_ai_readiness_completed',
                    status=status.status,
                    ready_providers=status.ready_providers,
                    degradation_reason_codes=status.reason_codes,
                    attempts=attempt,
                    duration_ms=status.duration_ms,
                )
                return status

            if attempt < retry_attempts:
                logger.info(
                    'desktop_startup_ai_readiness_retry_scheduled',
                    attempt=attempt + 1,
                    retry_delay_seconds=retry_delay_seconds,
                )
                await asyncio.sleep(retry_delay_seconds)

        reason_code = (
            'startup_ai_readiness_timeout'
            if isinstance(last_error, TimeoutError)
            else 'startup_ai_readiness_error'
        )
        failed_status = _build_failed_status(
            started_at=started_at,
            attempts=retry_attempts,
            max_attempts=retry_attempts,
            timeout_seconds=timeout_seconds,
            retry_delay_seconds=retry_delay_seconds,
            reason_code=reason_code,
            reason='AI readiness diagnostics did not complete successfully.',
        )
        self._last_status = failed_status
        logger.info(
            'desktop_startup_ai_readiness_failed',
            status=failed_status.status,
            reason_codes=failed_status.reason_codes,
            attempts=retry_attempts,
            duration_ms=failed_status.duration_ms,
        )
        return failed_status

    def get_status(self) -> DesktopStartupStatusResponse:
        return self._last_status

    async def wait_for_completion(self) -> DesktopStartupStatusResponse:
        if self._task is not None:
            await self._task

        return self._last_status

    def reset_for_tests(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()

        self._task = None
        self._last_status = self._build_initial_status()

    @staticmethod
    def _build_initial_status() -> DesktopStartupStatusResponse:
        return DesktopStartupStatusResponse(
            status='not_ready',
            phase='pending',
            attempts=0,
            max_attempts=settings.DESKTOP_STARTUP_AI_CHECK_RETRY_ATTEMPTS,
            timeout_seconds=settings.DESKTOP_STARTUP_AI_CHECK_TIMEOUT_SECONDS,
            retry_delay_seconds=(
                settings.DESKTOP_STARTUP_AI_CHECK_RETRY_DELAY_SECONDS
            ),
            message='AI readiness checks have not started yet.',
            hints=[
                'Startup diagnostics will run when the desktop app starts.'
            ],
        )


desktop_startup_orchestrator = DesktopStartupOrchestrator()


def start_desktop_startup_orchestration() -> None:
    desktop_startup_orchestrator.start()


async def stop_desktop_startup_orchestration() -> None:
    await desktop_startup_orchestrator.stop()


def get_desktop_startup_status() -> DesktopStartupStatusResponse:
    return desktop_startup_orchestrator.get_status()


async def run_desktop_startup_checks() -> DesktopStartupStatusResponse:
    return await desktop_startup_orchestrator.run_checks()


def _aggregate_startup_status(
    *,
    providers: ProvidersDiscoveryResponse,
    started_at: datetime,
    attempts: int,
    max_attempts: int,
    timeout_seconds: float,
    retry_delay_seconds: float,
) -> DesktopStartupStatusResponse:
    ready_providers = providers.ready_providers
    unready_providers = [
        provider for provider in providers.providers if not provider.ready
    ]
    reason_codes = [
        provider.reason_code
        for provider in unready_providers
        if provider.reason_code is not None
    ]
    degradation_reasons = [
        provider.reason
        for provider in unready_providers
        if provider.reason is not None
    ]

    if not ready_providers:
        status: StartupStatus = 'not_ready'
        message = 'No AI providers are ready.'
    elif unready_providers:
        status = 'degraded'
        message = 'At least one AI provider is ready, but some are degraded.'
    else:
        status = 'ready'
        message = 'All configured AI providers are ready.'

    completed_at = _utc_now()

    return DesktopStartupStatusResponse(
        status=status,
        phase='completed',
        providers=providers,
        ready_providers=ready_providers,
        recommended_provider=providers.recommended_provider,
        has_ready_provider=providers.has_ready_provider,
        reason_codes=reason_codes,
        degradation_reasons=degradation_reasons,
        hints=providers.hints,
        started_at=started_at,
        completed_at=completed_at,
        duration_ms=_duration_ms(started_at, completed_at),
        attempts=attempts,
        max_attempts=max_attempts,
        timeout_seconds=timeout_seconds,
        retry_delay_seconds=retry_delay_seconds,
        message=message,
    )


def _build_failed_status(
    *,
    started_at: datetime,
    attempts: int,
    max_attempts: int,
    timeout_seconds: float,
    retry_delay_seconds: float,
    reason_code: str,
    reason: str,
) -> DesktopStartupStatusResponse:
    completed_at = _utc_now()

    return DesktopStartupStatusResponse(
        status='not_ready',
        phase='failed',
        reason_codes=[reason_code],
        degradation_reasons=[reason],
        hints=['Check provider configuration and retry from onboarding UI.'],
        started_at=started_at,
        completed_at=completed_at,
        duration_ms=_duration_ms(started_at, completed_at),
        attempts=attempts,
        max_attempts=max_attempts,
        timeout_seconds=timeout_seconds,
        retry_delay_seconds=retry_delay_seconds,
        message=reason,
    )


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _duration_ms(started_at: datetime, completed_at: datetime) -> int:
    return max(0, int((completed_at - started_at).total_seconds() * 1000))
