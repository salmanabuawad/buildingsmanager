from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Building(BaseModel):
    id: Optional[str] = None
    name: str
    total_units: int
    apartment_area: float
    storage_area: float
    pergola_area: float
    balcony_area: float
    total_building_area: float
    created_at: Optional[datetime] = None

class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    total_units: Optional[int] = None
    apartment_area: Optional[float] = None
    storage_area: Optional[float] = None
    pergola_area: Optional[float] = None
    balcony_area: Optional[float] = None
    total_building_area: Optional[float] = None

class Apartment(BaseModel):
    id: Optional[str] = None
    building_id: str
    apartment_number: str
    floor: Optional[int] = None
    apartment_area: float
    storage_area: float
    pergola_area: float
    balcony_area: float
    garden_area: Optional[float] = 0
    total_apartment_area: float
    pdf_file_url: Optional[str] = None
    dwg_file_url: Optional[str] = None
    created_at: Optional[datetime] = None

class ApartmentUpdate(BaseModel):
    apartment_number: Optional[str] = None
    floor: Optional[int] = None
    apartment_area: Optional[float] = None
    storage_area: Optional[float] = None
    pergola_area: Optional[float] = None
    balcony_area: Optional[float] = None
    garden_area: Optional[float] = None
    total_apartment_area: Optional[float] = None
    pdf_file_url: Optional[str] = None
    dwg_file_url: Optional[str] = None
