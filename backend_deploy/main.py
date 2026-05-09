"""
BuildingsManager FastAPI application.
Replaces Supabase (PostgREST + Auth + Storage + Edge Functions).
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import init_pool, close_pool
from app.limiter import limiter
from app.queue_worker import start_queue_worker, stop_queue_worker
from app.routers import rest, rpc, auth, files, email
from app.routers import export_to_automation, export_zip
from app.routers.data import router as data_router, bulk_router as data_bulk_router
from app.routers.service_ops import router as service_ops_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    start_queue_worker()
    yield
    stop_queue_worker()
    await close_pool()


app = FastAPI(
    title="BuildingsManager API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(rest.router, prefix="/api/rest", tags=["REST"])
app.include_router(rpc.router, prefix="/api/rpc", tags=["RPC"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(email.router, prefix="/api/email", tags=["Email"])
app.include_router(export_to_automation.router, prefix="/api/export", tags=["Export"])
app.include_router(export_zip.router, prefix="/api/export", tags=["Export ZIP"])
# Service-layer REST endpoints (assets, buildings, audit, etc.)
app.include_router(service_ops_router, prefix="/api", tags=["Service"])
# Generic data API: bulk_router first (fixed paths), then table router (/{table})
app.include_router(data_bulk_router, prefix="/api/data", tags=["Data"])
app.include_router(data_router, prefix="/api/data", tags=["Data"])


@app.get("/")
def root():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/health")
async def health():
    from app.database import fetch_val
    try:
        await fetch_val("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "healthy" if db_ok else "degraded", "db": db_ok}
