from fastapi import APIRouter

from app.api.v1.jobs import router as jobs_router
from app.core.config import settings

router_v1 = APIRouter(prefix=settings.API_V1_STR)
router_v1.include_router(jobs_router)
