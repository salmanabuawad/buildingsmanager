from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, buildings, assets, asset_types, files, audit, email, data, operators_managers

app = FastAPI(
    title="AssetFlow API",
    description="Backend API for AssetFlow - Building and Asset Management System",
    version="1.0.0"
)

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
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(email.router, prefix="/api/email", tags=["Email"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(operators_managers.router, prefix="/api", tags=["Operators & Managers"])


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
