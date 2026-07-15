#!/usr/bin/env python3
"""Дымовой тест desktop-бинарника backend (PyInstaller).

Запускает бинарник напрямую как подпроцесс (без Electron), проверяет:
1. health — бинарник загружается и обслуживает HTTP;
2. static — корень отдаёт встроенный фронтенд;
3. upload — принимает синтетический JPEG;
4. process → status → results → export — только если в окружении задан
   OPENROUTER_API_KEY или GEMINI_API_KEY (иначе этапы пропускаются,
   выход с кодом 0: health+upload уже покрывают риск упаковки).

Запуск (Pillow берётся из backend-окружения):
    uv run --project backend python desktop/scripts/smoke-test.py \
        [путь-к-бинарнику]

По умолчанию путь к бинарнику: backend/dist/photo-metadata-backend.
"""

import io
import json
import mimetypes
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE_URL = 'http://127.0.0.1:8000'
HEALTH_URL = f'{BASE_URL}/api/v1/desktop/health'
HEALTH_TIMEOUT_SECONDS = 30
PROCESS_TIMEOUT_SECONDS = 180

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BINARY = PROJECT_ROOT / 'backend' / 'dist' / 'photo-metadata-backend'


def log(message: str) -> None:
    print(f'[smoke-test] {message}', flush=True)


def make_jpeg_bytes() -> bytes:
    from PIL import Image

    image = Image.new('RGB', (640, 480), color=(120, 90, 200))
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=90)
    return buffer.getvalue()


def http_json(method: str, url: str, timeout: float = 10):
    request = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, json.loads(response.read().decode())


def upload_jpeg(jpeg_bytes: bytes, filename: str) -> dict:
    boundary = uuid.uuid4().hex
    content_type = (
        mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    )
    body = io.BytesIO()
    body.write(f'--{boundary}\r\n'.encode())
    body.write(
        (
            'Content-Disposition: form-data; name="files"; '
            f'filename="{filename}"\r\n'
            f'Content-Type: {content_type}\r\n\r\n'
        ).encode()
    )
    body.write(jpeg_bytes)
    body.write(f'\r\n--{boundary}--\r\n'.encode())

    request = urllib.request.Request(
        f'{BASE_URL}/api/v1/jobs/upload',
        data=body.getvalue(),
        method='POST',
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def wait_for_health(process: subprocess.Popen) -> dict:
    deadline = time.time() + HEALTH_TIMEOUT_SECONDS
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f'binary exited early with code {process.returncode}'
            )
        try:
            status, payload = http_json('GET', HEALTH_URL, timeout=2)
            if status == 200:
                return payload
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.3)
    raise TimeoutError(
        f'health endpoint not ready within {HEALTH_TIMEOUT_SECONDS}s'
    )


def run_full_flow(job_id: str) -> None:
    status, job = http_json(
        'POST', f'{BASE_URL}/api/v1/jobs/{job_id}/process', timeout=30
    )
    log(f'process started, job status: {job["status"]}')

    deadline = time.time() + PROCESS_TIMEOUT_SECONDS
    while time.time() < deadline:
        status, job_status = http_json(
            'GET', f'{BASE_URL}/api/v1/jobs/{job_id}/status'
        )
        if job_status['status'] in ('completed', 'failed', 'cancelled'):
            break
        time.sleep(2)
    log(f'final job status: {job_status["status"]}')
    if job_status['status'] != 'completed':
        raise RuntimeError(f'processing did not complete: {job_status}')

    status, results = http_json(
        'GET', f'{BASE_URL}/api/v1/jobs/{job_id}/results'
    )
    files = results.get('files', [])
    if not files:
        raise RuntimeError('results are empty')
    log(f'results: {len(files)} file(s)')

    status, export = http_json(
        'POST', f'{BASE_URL}/api/v1/jobs/{job_id}/export?csv=true', timeout=30
    )
    log(f'export started: {export}')


def main() -> int:
    binary = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BINARY
    if not binary.is_file():
        log(f'ERROR: binary not found: {binary}')
        return 1

    log(f'launching {binary}')
    process = subprocess.Popen(
        [str(binary)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        health = wait_for_health(process)
        log(f'health OK: {health}')

        request = urllib.request.Request(BASE_URL)
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read(512).decode(errors='replace')
        if '<title>' not in body:
            raise RuntimeError('root does not serve embedded frontend')
        log('static frontend OK: / serves embedded build')

        job = upload_jpeg(make_jpeg_bytes(), 'smoke-test.jpg')
        job_id = job['job_id']
        if not job['files']:
            raise RuntimeError('upload returned job without files')
        log(f'upload OK: job {job_id}, {len(job["files"])} file(s)')

        if os.environ.get('OPENROUTER_API_KEY') or os.environ.get(
            'GEMINI_API_KEY'
        ):
            run_full_flow(job_id)
            log('full flow OK: process -> results -> export')
        else:
            log(
                'SKIP process/results/export: no OPENROUTER_API_KEY '
                'or GEMINI_API_KEY in environment'
            )

        log('PASS')
        return 0
    except Exception as error:
        log(f'FAIL: {error}')
        return 1
    finally:
        process.send_signal(signal.SIGTERM)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        output = process.stdout.read() if process.stdout else ''
        if output:
            tail = output[-2000:]
            print('--- backend output (tail) ---')
            print(tail)


if __name__ == '__main__':
    sys.exit(main())
