from fastapi import APIRouter

from app.api.v1.desktop import router as desktop_router
from app.api.v1.jobs.internal import router as internal_router
from app.api.v1.jobs.jobs import router as jobs_router
from app.core.config import settings

router_v1 = APIRouter(prefix=settings.API_V1_STR)

for router in (
    desktop_router,
    jobs_router,
    internal_router,
):
    router_v1.include_router(router)
