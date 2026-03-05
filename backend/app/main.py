# ---------------------------------------------------------------------------
# Copyright (c) 2025 Kortex Digital. All rights reserved. Proprietary.
# Contact: info@kortexd.com
# NO REVERSE ENGINEERING. Use by AI/ML tools (e.g. LLMs, code assistants,
# training data, or automated analysis) is prohibited. See COPYRIGHT.
# ---------------------------------------------------------------------------

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.limiter import limiter

logger = logging.getLogger(__name__)
from app.routers import auth, buildings, assets, asset_types, files, audit, email, data, rest_operations, export_zip, export_to_automation, inspection_tasks
from app.routers.data import delete_by_query_body
from app.api.v1 import router as v1_router
from app.queue_worker import start_queue_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_queue_worker()
    yield
    from app.queue_worker import stop_queue_worker
    stop_queue_worker()


app = FastAPI(
    title="AssetFlow API",
    description="Backend API for AssetFlow - Building and Asset Management System",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

# Explicit route so it is always found (avoids 404 when proxy or router order varies)
app.add_api_route("/api/data/bulk/delete-by-query", delete_by_query_body, methods=["POST"], tags=["Data"])
app.add_api_route("/data/bulk/delete-by-query", delete_by_query_body, methods=["POST"], tags=["Data"])

# REST operations (service layer) - register first so /api/assets/save-bulk-transactional etc. take precedence
app.include_router(rest_operations.router, prefix="/api", tags=["REST Operations"])
# API v1: Repository-layer example (API → Service → Repo → DB)
app.include_router(v1_router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(buildings.router, prefix="/api/buildings", tags=["Buildings"])
app.include_router(assets.router, prefix="/api/assets", tags=["Assets"])
app.include_router(asset_types.router, prefix="/api/asset-types", tags=["Asset Types"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(files.storage_router, prefix="/storage", tags=["Files"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(email.router, prefix="/api/email", tags=["Email"])
# Bulk/fixed paths first so /api/data/bulk/delete-by-query is not matched as /{table}
app.include_router(data.bulk_router, prefix="/api/data", tags=["Data"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(data.bulk_router, prefix="/data", tags=["Data"])
app.include_router(data.router, prefix="/data", tags=["Data"])  # in case proxy strips /api
app.include_router(export_zip.router, prefix="/api/export", tags=["Export"])
app.include_router(export_to_automation.router, prefix="/api/export-to-automation", tags=["Export to automation"])
app.include_router(inspection_tasks.router, prefix="/api/inspection-tasks", tags=["Inspection Tasks"])
app.include_router(inspection_tasks.reports_router, prefix="/api/inspection-reports", tags=["Inspection Reports"])


@app.get("/")
def root():
    return {
        "message": "AssetFlow API",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api")
def api_root():
    """API root so GET /api does not 404."""
    return {"message": "AssetFlow API", "docs": "/docs"}


@app.get("/api/proxy-test")
@app.post("/api/proxy-test")
def api_proxy_test():
    """If you see this from http://localhost/api/proxy-test, the proxy is working."""
    return {"proxy": "ok", "message": "Request reached the backend"}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Return JSON 404 with path so frontend and logs can see what was requested."""
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={"detail": exc.detail, "path": str(request.url.path)},
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return 500; sanitize detail in production to avoid leaking internals."""
    logger.exception("Unhandled exception: %s", exc)
    detail = str(exc) if settings.ENVIRONMENT == "development" else "Internal server error"
    return JSONResponse(status_code=500, content={"detail": detail})
