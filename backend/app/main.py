from pathlib import Path
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routers import auth, buildings, assets, asset_types, audit, email

# Fail fast with a clear message if required production config is missing
def _config_ok():
    if not settings.SECRET_KEY or settings.SECRET_KEY.strip() == "":
        return False, "SECRET_KEY"
    if settings.ENVIRONMENT == "production" and not (settings.PGPASSWORD or settings.DATABASE_URL):
        return False, "PGPASSWORD (or DATABASE_URL)"
    return True, None


def _is_allowed_origin(origin: str) -> bool:
    """Allow *.azurestaticapps.net, wavelync.com, and localhost (http or https)."""
    if not origin or not origin.startswith(("http://", "https://")):
        return False
    return (
        origin.endswith(".azurestaticapps.net")
        or "wavelync.com" in origin
        or "localhost" in origin
    )


class AzureStaticWebAppCORSMiddleware(BaseHTTPMiddleware):
    """Allow *.azurestaticapps.net and wavelync.com origins for CORS."""

    async def dispatch(self, request: Request, call_next):
        origin = (request.headers.get("origin") or "").strip()
        allowed = _is_allowed_origin(origin)

        if request.method == "OPTIONS" and allowed:
            from starlette.responses import Response
            return Response(
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Max-Age": "86400",
                    "Vary": "Origin",
                },
            )
        response = await call_next(request)
        if allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response


app = FastAPI(
    title="AssetFlow API",
    description="Backend API for AssetFlow - Building and Asset Management System",
    version="1.0.0"
)

# Allow *.azurestaticapps.net first so preflight gets correct headers
app.add_middleware(AzureStaticWebAppCORSMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(buildings.router, prefix="/api/buildings", tags=["Buildings"])
app.include_router(assets.router, prefix="/api/assets", tags=["Assets"])
app.include_router(asset_types.router, prefix="/api/asset-types", tags=["Asset Types"])
# File upload (Azure Blob) disabled for now
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(email.router, prefix="/api/email", tags=["Email"])


@app.get("/health")
def health_check():
    ok, missing = _config_ok()
    if not ok:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": f"Missing required setting: {missing}. Add it in Azure App Service → Configuration → Application settings."},
        )
    return {"status": "healthy"}


# Serve SPA from / when backend/static exists (combined deploy: wavelync.com + wavelync.com/api)
_static_dir = Path(__file__).resolve().parent.parent / "static"
_config_ok_result, _config_missing = _config_ok()
if not _config_ok_result and _config_missing:
    _CONFIG_ERROR_HTML = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Configuration required</title></head><body style="font-family:sans-serif;max-width:600px;margin:2rem auto;padding:1rem;">
    <h1>Configuration required</h1>
    <p>Missing required setting: <strong>{_config_missing}</strong>.</p>
    <p>Add it in <strong>Azure Portal</strong> → your App Service → <strong>Configuration</strong> → <strong>Application settings</strong>:</p>
    <ul>
      <li><strong>SECRET_KEY</strong> – e.g. run <code>openssl rand -hex 32</code> and paste the value</li>
      <li><strong>PGPASSWORD</strong> – your Azure PostgreSQL database password</li>
    </ul>
    <p>Then save and restart the app.</p>
    <p><a href="/health">/health</a></p>
    </body></html>"""

    @app.get("/", response_class=HTMLResponse)
    @app.get("/index.html", response_class=HTMLResponse)
    def _config_error_page():
        return HTMLResponse(content=_CONFIG_ERROR_HTML, status_code=503)
elif _static_dir.is_dir() and any(_static_dir.iterdir()):
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {
            "message": "AssetFlow API",
            "version": "1.0.0",
            "environment": settings.ENVIRONMENT,
            "api": "/api",
            "docs": "/docs",
        }
