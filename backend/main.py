from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
from dotenv import load_dotenv
from database import get_db_connection
from models import Building, BuildingUpdate, Apartment, ApartmentUpdate

load_dotenv()

app = FastAPI(title="Buildings Manager API")

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Buildings Manager API", "status": "running"}

@app.get("/api/buildings", response_model=List[dict])
def get_buildings():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, total_units, apartment_area, storage_area,
                       pergola_area, balcony_area, total_building_area, created_at
                FROM buildings
                ORDER BY name
            """)
            buildings = cur.fetchall()
            return buildings

@app.get("/api/buildings/{building_id}", response_model=dict)
def get_building(building_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, total_units, apartment_area, storage_area,
                       pergola_area, balcony_area, total_building_area, created_at
                FROM buildings
                WHERE id = %s
            """, (building_id,))
            building = cur.fetchone()
            if not building:
                raise HTTPException(status_code=404, detail="Building not found")
            return building

@app.post("/api/buildings", response_model=dict)
def create_building(building: Building):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO buildings (name, total_units, apartment_area, storage_area,
                                      pergola_area, balcony_area, total_building_area)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, name, total_units, apartment_area, storage_area,
                          pergola_area, balcony_area, total_building_area, created_at
            """, (building.name, building.total_units, building.apartment_area,
                  building.storage_area, building.pergola_area, building.balcony_area,
                  building.total_building_area))
            new_building = cur.fetchone()
            return new_building

@app.put("/api/buildings/{building_id}", response_model=dict)
def update_building(building_id: str, building: BuildingUpdate):
    update_fields = []
    values = []

    if building.name is not None:
        update_fields.append("name = %s")
        values.append(building.name)
    if building.total_units is not None:
        update_fields.append("total_units = %s")
        values.append(building.total_units)
    if building.apartment_area is not None:
        update_fields.append("apartment_area = %s")
        values.append(building.apartment_area)
    if building.storage_area is not None:
        update_fields.append("storage_area = %s")
        values.append(building.storage_area)
    if building.pergola_area is not None:
        update_fields.append("pergola_area = %s")
        values.append(building.pergola_area)
    if building.balcony_area is not None:
        update_fields.append("balcony_area = %s")
        values.append(building.balcony_area)
    if building.total_building_area is not None:
        update_fields.append("total_building_area = %s")
        values.append(building.total_building_area)

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(building_id)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE buildings
                SET {", ".join(update_fields)}
                WHERE id = %s
                RETURNING id, name, total_units, apartment_area, storage_area,
                          pergola_area, balcony_area, total_building_area, created_at
            """, values)
            updated_building = cur.fetchone()
            if not updated_building:
                raise HTTPException(status_code=404, detail="Building not found")
            return updated_building

@app.delete("/api/buildings/{building_id}")
def delete_building(building_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM buildings WHERE id = %s RETURNING id", (building_id,))
            deleted = cur.fetchone()
            if not deleted:
                raise HTTPException(status_code=404, detail="Building not found")
            return {"message": "Building deleted successfully"}

@app.get("/api/apartments", response_model=List[dict])
def get_apartments(building_id: Optional[str] = None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if building_id:
                cur.execute("""
                    SELECT id, building_id, apartment_number, floor, apartment_area,
                           storage_area, pergola_area, balcony_area, garden_area,
                           total_apartment_area, pdf_file_url, dwg_file_url, created_at
                    FROM apartments
                    WHERE building_id = %s
                    ORDER BY apartment_number
                """, (building_id,))
            else:
                cur.execute("""
                    SELECT id, building_id, apartment_number, floor, apartment_area,
                           storage_area, pergola_area, balcony_area, garden_area,
                           total_apartment_area, pdf_file_url, dwg_file_url, created_at
                    FROM apartments
                    ORDER BY apartment_number
                """)
            apartments = cur.fetchall()
            return apartments

@app.get("/api/apartments/{apartment_id}", response_model=dict)
def get_apartment(apartment_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, building_id, apartment_number, floor, apartment_area,
                       storage_area, pergola_area, balcony_area, garden_area,
                       total_apartment_area, pdf_file_url, dwg_file_url, created_at
                FROM apartments
                WHERE id = %s
            """, (apartment_id,))
            apartment = cur.fetchone()
            if not apartment:
                raise HTTPException(status_code=404, detail="Apartment not found")
            return apartment

@app.post("/api/apartments", response_model=dict)
def create_apartment(apartment: Apartment):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO apartments (building_id, apartment_number, floor, apartment_area,
                                       storage_area, pergola_area, balcony_area, garden_area,
                                       total_apartment_area, pdf_file_url, dwg_file_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, building_id, apartment_number, floor, apartment_area,
                          storage_area, pergola_area, balcony_area, garden_area,
                          total_apartment_area, pdf_file_url, dwg_file_url, created_at
            """, (apartment.building_id, apartment.apartment_number, apartment.floor,
                  apartment.apartment_area, apartment.storage_area, apartment.pergola_area,
                  apartment.balcony_area, apartment.garden_area, apartment.total_apartment_area,
                  apartment.pdf_file_url, apartment.dwg_file_url))
            new_apartment = cur.fetchone()
            return new_apartment

@app.put("/api/apartments/{apartment_id}", response_model=dict)
def update_apartment(apartment_id: str, apartment: ApartmentUpdate):
    update_fields = []
    values = []

    if apartment.apartment_number is not None:
        update_fields.append("apartment_number = %s")
        values.append(apartment.apartment_number)
    if apartment.floor is not None:
        update_fields.append("floor = %s")
        values.append(apartment.floor)
    if apartment.apartment_area is not None:
        update_fields.append("apartment_area = %s")
        values.append(apartment.apartment_area)
    if apartment.storage_area is not None:
        update_fields.append("storage_area = %s")
        values.append(apartment.storage_area)
    if apartment.pergola_area is not None:
        update_fields.append("pergola_area = %s")
        values.append(apartment.pergola_area)
    if apartment.balcony_area is not None:
        update_fields.append("balcony_area = %s")
        values.append(apartment.balcony_area)
    if apartment.garden_area is not None:
        update_fields.append("garden_area = %s")
        values.append(apartment.garden_area)
    if apartment.total_apartment_area is not None:
        update_fields.append("total_apartment_area = %s")
        values.append(apartment.total_apartment_area)
    if apartment.pdf_file_url is not None:
        update_fields.append("pdf_file_url = %s")
        values.append(apartment.pdf_file_url)
    if apartment.dwg_file_url is not None:
        update_fields.append("dwg_file_url = %s")
        values.append(apartment.dwg_file_url)

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(apartment_id)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE apartments
                SET {", ".join(update_fields)}
                WHERE id = %s
                RETURNING id, building_id, apartment_number, floor, apartment_area,
                          storage_area, pergola_area, balcony_area, garden_area,
                          total_apartment_area, pdf_file_url, dwg_file_url, created_at
            """, values)
            updated_apartment = cur.fetchone()
            if not updated_apartment:
                raise HTTPException(status_code=404, detail="Apartment not found")
            return updated_apartment

@app.delete("/api/apartments/{apartment_id}")
def delete_apartment(apartment_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM apartments WHERE id = %s RETURNING id", (apartment_id,))
            deleted = cur.fetchone()
            if not deleted:
                raise HTTPException(status_code=404, detail="Apartment not found")
            return {"message": "Apartment deleted successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
