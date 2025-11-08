import strawberry
from typing import List, Optional
from database import get_db_connection
from schema import (
    Building, Apartment, BuildingInput, BuildingUpdateInput,
    ApartmentInput, ApartmentUpdateInput, DeleteResponse
)

@strawberry.type
class Query:
    @strawberry.field
    def buildings(self) -> List[Building]:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, name, total_units, apartment_area, storage_area,
                           pergola_area, balcony_area, total_building_area, created_at
                    FROM buildings
                    ORDER BY name
                """)
                rows = cur.fetchall()
                return [Building(**row) for row in rows]

    @strawberry.field
    def building(self, id: str) -> Optional[Building]:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, name, total_units, apartment_area, storage_area,
                           pergola_area, balcony_area, total_building_area, created_at
                    FROM buildings
                    WHERE id = %s
                """, (id,))
                row = cur.fetchone()
                return Building(**row) if row else None

    @strawberry.field
    def apartments(self, building_id: Optional[str] = None) -> List[Apartment]:
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
                rows = cur.fetchall()
                return [Apartment(**row) for row in rows]

    @strawberry.field
    def apartment(self, id: str) -> Optional[Apartment]:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, building_id, apartment_number, floor, apartment_area,
                           storage_area, pergola_area, balcony_area, garden_area,
                           total_apartment_area, pdf_file_url, dwg_file_url, created_at
                    FROM apartments
                    WHERE id = %s
                """, (id,))
                row = cur.fetchone()
                return Apartment(**row) if row else None

@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_building(self, input: BuildingInput) -> Building:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO buildings (name, total_units, apartment_area, storage_area,
                                          pergola_area, balcony_area, total_building_area)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, name, total_units, apartment_area, storage_area,
                              pergola_area, balcony_area, total_building_area, created_at
                """, (input.name, input.total_units, input.apartment_area,
                      input.storage_area, input.pergola_area, input.balcony_area,
                      input.total_building_area))
                row = cur.fetchone()
                return Building(**row)

    @strawberry.mutation
    def update_building(self, id: str, input: BuildingUpdateInput) -> Optional[Building]:
        update_fields = []
        values = []

        if input.name is not None:
            update_fields.append("name = %s")
            values.append(input.name)
        if input.total_units is not None:
            update_fields.append("total_units = %s")
            values.append(input.total_units)
        if input.apartment_area is not None:
            update_fields.append("apartment_area = %s")
            values.append(input.apartment_area)
        if input.storage_area is not None:
            update_fields.append("storage_area = %s")
            values.append(input.storage_area)
        if input.pergola_area is not None:
            update_fields.append("pergola_area = %s")
            values.append(input.pergola_area)
        if input.balcony_area is not None:
            update_fields.append("balcony_area = %s")
            values.append(input.balcony_area)
        if input.total_building_area is not None:
            update_fields.append("total_building_area = %s")
            values.append(input.total_building_area)

        if not update_fields:
            return None

        values.append(id)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    UPDATE buildings
                    SET {", ".join(update_fields)}
                    WHERE id = %s
                    RETURNING id, name, total_units, apartment_area, storage_area,
                              pergola_area, balcony_area, total_building_area, created_at
                """, values)
                row = cur.fetchone()
                return Building(**row) if row else None

    @strawberry.mutation
    def delete_building(self, id: str) -> DeleteResponse:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM buildings WHERE id = %s RETURNING id", (id,))
                deleted = cur.fetchone()
                if deleted:
                    return DeleteResponse(success=True, message="Building deleted successfully")
                return DeleteResponse(success=False, message="Building not found")

    @strawberry.mutation
    def create_apartment(self, input: ApartmentInput) -> Apartment:
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
                """, (input.building_id, input.apartment_number, input.floor,
                      input.apartment_area, input.storage_area, input.pergola_area,
                      input.balcony_area, input.garden_area, input.total_apartment_area,
                      input.pdf_file_url, input.dwg_file_url))
                row = cur.fetchone()
                return Apartment(**row)

    @strawberry.mutation
    def update_apartment(self, id: str, input: ApartmentUpdateInput) -> Optional[Apartment]:
        update_fields = []
        values = []

        if input.apartment_number is not None:
            update_fields.append("apartment_number = %s")
            values.append(input.apartment_number)
        if input.floor is not None:
            update_fields.append("floor = %s")
            values.append(input.floor)
        if input.apartment_area is not None:
            update_fields.append("apartment_area = %s")
            values.append(input.apartment_area)
        if input.storage_area is not None:
            update_fields.append("storage_area = %s")
            values.append(input.storage_area)
        if input.pergola_area is not None:
            update_fields.append("pergola_area = %s")
            values.append(input.pergola_area)
        if input.balcony_area is not None:
            update_fields.append("balcony_area = %s")
            values.append(input.balcony_area)
        if input.garden_area is not None:
            update_fields.append("garden_area = %s")
            values.append(input.garden_area)
        if input.total_apartment_area is not None:
            update_fields.append("total_apartment_area = %s")
            values.append(input.total_apartment_area)
        if input.pdf_file_url is not None:
            update_fields.append("pdf_file_url = %s")
            values.append(input.pdf_file_url)
        if input.dwg_file_url is not None:
            update_fields.append("dwg_file_url = %s")
            values.append(input.dwg_file_url)

        if not update_fields:
            return None

        values.append(id)

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
                row = cur.fetchone()
                return Apartment(**row) if row else None

    @strawberry.mutation
    def delete_apartment(self, id: str) -> DeleteResponse:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM apartments WHERE id = %s RETURNING id", (id,))
                deleted = cur.fetchone()
                if deleted:
                    return DeleteResponse(success=True, message="Apartment deleted successfully")
                return DeleteResponse(success=False, message="Apartment not found")
