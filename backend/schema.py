import strawberry
from typing import Optional, List
from datetime import datetime

@strawberry.type
class Building:
    id: str
    name: str
    total_units: int
    apartment_area: float
    storage_area: float
    pergola_area: float
    balcony_area: float
    total_building_area: float
    created_at: datetime

@strawberry.type
class Apartment:
    id: str
    building_id: str
    apartment_number: str
    floor: Optional[int]
    apartment_area: float
    storage_area: float
    pergola_area: float
    balcony_area: float
    garden_area: Optional[float]
    total_apartment_area: float
    pdf_file_url: Optional[str]
    dwg_file_url: Optional[str]
    created_at: datetime

@strawberry.input
class BuildingInput:
    name: str
    total_units: int
    apartment_area: float
    storage_area: float
    pergola_area: float
    balcony_area: float
    total_building_area: float

@strawberry.input
class BuildingUpdateInput:
    name: Optional[str] = None
    total_units: Optional[int] = None
    apartment_area: Optional[float] = None
    storage_area: Optional[float] = None
    pergola_area: Optional[float] = None
    balcony_area: Optional[float] = None
    total_building_area: Optional[float] = None

@strawberry.input
class ApartmentInput:
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

@strawberry.input
class ApartmentUpdateInput:
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

@strawberry.type
class DeleteResponse:
    success: bool
    message: str
