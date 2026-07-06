import asyncio
from collections.abc import Callable, Coroutine
from typing import Any, Concatenate, ParamSpec
from uuid import UUID

import structlog

logger = structlog.get_logger(__name__)

P = ParamSpec('P')
TaskRunner = Callable[Concatenate[UUID, P], Coroutine[Any, Any, None]]


class AsyncJobTaskManager:
    """
    Управляет фоновыми asyncio-задачами, привязанными к job_id.
    """

    def __init__(self, name: str) -> None:
        self._name = name
        self._tasks: dict[UUID, asyncio.Task[None]] = {}

    def start(
        self,
        job_id: UUID,
        runner: TaskRunner[P],
        *args: P.args,
        **kwargs: P.kwargs,
    ) -> bool:
        """
        Запускает фоновую задачу, если для job_id еще нет running task.
        """
        current_task = self._tasks.get(job_id)
        if current_task is not None and not current_task.done():
            logger.info(
                'background_task_already_running',
                task_manager=self._name,
                job_id=str(job_id),
            )
            return False

        task = asyncio.create_task(runner(job_id, *args, **kwargs))
        self._tasks[job_id] = task
        task.add_done_callback(
            lambda completed_task: self._handle_task_done(
                job_id,
                completed_task,
            )
        )

        logger.info(
            'background_task_started',
            task_manager=self._name,
            job_id=str(job_id),
        )
        return True

    def cancel(self, job_id: UUID) -> bool:
        """
        Запрашивает отмену running task для job_id.
        """
        task = self._tasks.get(job_id)
        if task is None or task.done():
            logger.info(
                'background_task_cancel_skipped',
                task_manager=self._name,
                job_id=str(job_id),
                reason='task_not_running',
            )
            return False

        task.cancel()
        logger.info(
            'background_task_cancel_requested',
            task_manager=self._name,
            job_id=str(job_id),
        )
        return True

    def is_running(self, job_id: UUID) -> bool:
        """
        Проверяет, есть ли активная task для job_id.
        """
        task = self._tasks.get(job_id)
        return task is not None and not task.done()

    async def stop_all(self) -> None:
        """
        Отменяет все running tasks и дожидается завершения их cleanup.
        """
        running_tasks = [
            task for task in self._tasks.values() if not task.done()
        ]
        if not running_tasks:
            return

        logger.info(
            'background_task_manager_shutdown_started',
            task_manager=self._name,
            tasks_count=len(running_tasks),
        )

        for task in running_tasks:
            task.cancel()

        await asyncio.gather(*running_tasks, return_exceptions=True)
        self._tasks.clear()

        logger.info(
            'background_task_manager_shutdown_completed',
            task_manager=self._name,
        )

    def _handle_task_done(
        self,
        job_id: UUID,
        task: asyncio.Task[None],
    ) -> None:
        self._tasks.pop(job_id, None)

        if task.cancelled():
            logger.info(
                'background_task_cancelled',
                task_manager=self._name,
                job_id=str(job_id),
            )
            return

        error = task.exception()
        if error is not None:
            logger.error(
                'background_task_failed',
                task_manager=self._name,
                job_id=str(job_id),
                error=str(error),
            )
            return

        logger.info(
            'background_task_completed',
            task_manager=self._name,
            job_id=str(job_id),
        )


job_task_manager = AsyncJobTaskManager('job_processing')
export_task_manager = AsyncJobTaskManager('job_export')


async def stop_background_task_managers() -> None:
    """
    Останавливает все фоновые задачи приложения при shutdown.
    """
    await asyncio.gather(
        job_task_manager.stop_all(),
        export_task_manager.stop_all(),
    )
