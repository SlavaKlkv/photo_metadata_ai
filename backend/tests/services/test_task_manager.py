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
