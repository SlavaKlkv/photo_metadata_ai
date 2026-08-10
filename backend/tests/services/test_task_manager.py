import asyncio
from uuid import uuid4

import pytest

from app.services.task_manager import AsyncJobTaskManager


@pytest.mark.asyncio
async def test_task_manager_runs_task_and_removes_completed_entry():
    manager = AsyncJobTaskManager('test')
    job_id = uuid4()
    completed = asyncio.Event()

    async def runner(current_job_id, value):
        assert current_job_id == job_id
        assert value == 'payload'
        completed.set()

    assert manager.start(job_id, runner, 'payload') is True
    await completed.wait()
    await asyncio.sleep(0)

    assert manager.is_running(job_id) is False
    assert manager.cancel(job_id) is False


@pytest.mark.asyncio
async def test_task_manager_rejects_duplicate_and_cancels_running_task():
    manager = AsyncJobTaskManager('test')
    job_id = uuid4()
    started = asyncio.Event()

    async def runner(current_job_id):
        assert current_job_id == job_id
        started.set()
        await asyncio.Event().wait()

    assert manager.start(job_id, runner) is True
    await started.wait()
    assert manager.start(job_id, runner) is False
    assert manager.is_running(job_id) is True
    assert manager.cancel(job_id) is True
    await asyncio.sleep(0)

    assert manager.is_running(job_id) is False


@pytest.mark.asyncio
async def test_task_manager_cancel_and_wait_awaits_actual_stop():
    """
    cancel_and_wait возвращает управление только после того, как задача
    действительно остановилась — иначе сброс состояния будет затёрт.
    """
    manager = AsyncJobTaskManager('test')
    job_id = uuid4()
    started = asyncio.Event()
    cleanup_finished = False

    async def runner(_job_id):
        nonlocal cleanup_finished
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cleanup_finished = True
            raise

    assert manager.start(job_id, runner) is True
    await started.wait()

    assert await manager.cancel_and_wait(job_id) is True
    assert cleanup_finished is True
    assert manager.is_running(job_id) is False


@pytest.mark.asyncio
async def test_task_manager_cancel_and_wait_is_noop_without_running_task():
    manager = AsyncJobTaskManager('test')

    assert await manager.cancel_and_wait(uuid4()) is False


@pytest.mark.asyncio
async def test_task_manager_stop_all_cancels_every_task():
    manager = AsyncJobTaskManager('test')
    started = [asyncio.Event(), asyncio.Event()]

    async def runner(_job_id, event):
        event.set()
        await asyncio.Event().wait()

    for event in started:
        assert manager.start(uuid4(), runner, event) is True

    await asyncio.gather(*(event.wait() for event in started))
    await manager.stop_all()

    assert manager._tasks == {}


@pytest.mark.asyncio
async def test_task_manager_handles_failed_task():
    manager = AsyncJobTaskManager('test')
    job_id = uuid4()

    async def runner(_job_id):
        raise RuntimeError('boom')

    assert manager.start(job_id, runner) is True
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert manager.is_running(job_id) is False
