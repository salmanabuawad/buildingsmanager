from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, buildings, assets, asset_types, files, audit, email, data, operators_managers, users, change_log
from app.database import engine
from sqlalchemy import text


def run_migrations():
    """Auto-apply missing columns to buildings table on startup."""
    migrations = [
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS building_address integer",
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS address integer",
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS note text",
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS net_area numeric",
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS asset_count integer",
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS shared_parking_area numeric",
        "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS number_of_parking_units integer",
    ]
    try:
        with engine.connect() as conn:
            for sql in migrations:
                conn.execute(text(sql))
            # FK constraint (skip if exists)
            conn.execute(text("""
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_buildings_building_address'
                      AND table_name = 'buildings'
                  ) THEN
                    ALTER TABLE buildings
                      ADD CONSTRAINT fk_buildings_building_address
                      FOREIGN KEY (building_address) REFERENCES address_list(street_code)
                      ON DELETE SET NULL;
                  END IF;
                END$$;
            """))
            conn.commit()
    except Exception as e:
        print(f"[migration] Warning: {e}")


run_migrations()

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
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(change_log.router, prefix="/api/change-log", tags=["Change Log"])


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
