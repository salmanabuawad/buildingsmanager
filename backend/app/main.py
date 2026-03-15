"""
BuildingsManager FastAPI application.
Replaces Supabase (PostgREST + Auth + Storage + Edge Functions).
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_pool, close_pool
from app.routers import rest, rpc, auth, files, email


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(
    title="BuildingsManager API",
    version="1.0.0",
    lifespan=lifespan,
)

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
