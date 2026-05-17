from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, buildings, assets, asset_types, files, audit, email, data, operators_managers, users, change_log
from app.database import engine
from sqlalchemy import text


def run_migrations():
    """Auto-apply missing columns to the schema on startup.

    Each entry is (table, column, ddl_to_add). Before issuing the DDL we
    check information_schema.columns and skip silently if the column is
    already present — that way a DB user without ALTER privilege still
    starts the app cleanly when the schema is already in the right shape
    (which is the steady state).

    If a column is MISSING and the ALTER fails (e.g. owner check), the
    warning is loud and actionable so a human can run the ALTER manually
    as the table owner. Previously the warning was a stack-trace fragment
    and the operator couldn't tell whether the column actually got added.
    """
    migrations: list[tuple[str, str, str]] = [
        ("buildings", "building_address", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS building_address integer"),
        ("buildings", "address", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS address integer"),
        ("buildings", "note", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS note text"),
        ("buildings", "net_area", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS net_area numeric"),
        ("buildings", "asset_count", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS asset_count integer"),
        ("buildings", "shared_parking_area", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS shared_parking_area numeric"),
        ("buildings", "number_of_parking_units", "ALTER TABLE buildings ADD COLUMN IF NOT EXISTS number_of_parking_units integer"),
        ("asset_files", "file_description", "ALTER TABLE asset_files ADD COLUMN IF NOT EXISTS file_description text"),
    ]

    column_exists_sql = text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
    )

    with engine.connect() as conn:
        for table, column, ddl in migrations:
            try:
                already = conn.execute(column_exists_sql, {"t": table, "c": column}).first()
                if already:
                    continue
                conn.execute(text(ddl))
                conn.commit()
                print(f"[migration] applied: {table}.{column}")
            except Exception as e:
                conn.rollback()
                # Loud, actionable message: name the table/column and tell the
                # operator what to do. Don't dump the full stack — keep one line
                # so it's visible in journalctl tail.
                print(
                    f"[migration] *** ACTION REQUIRED *** column {table}.{column} is missing "
                    f"and the app user cannot ALTER it ({type(e).__name__}: {e}). "
                    f"Run as DB owner: psql -d <db> -c \"{ddl}\""
                )

        # FK constraint — same pattern: skip silently if present, loud warn if it fails.
        try:
            fk_exists = conn.execute(text(
                "SELECT 1 FROM information_schema.table_constraints "
                "WHERE constraint_name = 'fk_buildings_building_address' AND table_name = 'buildings'"
            )).first()
            if not fk_exists:
                conn.execute(text("""
                    ALTER TABLE buildings
                      ADD CONSTRAINT fk_buildings_building_address
                      FOREIGN KEY (building_address) REFERENCES address_list(street_code)
                      ON DELETE SET NULL
                """))
                conn.commit()
                print("[migration] applied: fk_buildings_building_address")
        except Exception as e:
            conn.rollback()
            print(
                f"[migration] *** ACTION REQUIRED *** fk_buildings_building_address could not be added "
                f"({type(e).__name__}: {e}). Run as DB owner."
            )


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
