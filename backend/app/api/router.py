from fastapi import APIRouter

from app.api.v1.jobs import router as jobs_router

router_v1 = APIRouter(prefix='/api/v1')
router_v1.include_router(jobs_router)
