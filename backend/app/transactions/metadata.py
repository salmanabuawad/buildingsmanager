"""
Python implementation of get_tables_fields_types (replacing DB function).
Returns tables/columns from information_schema via MetadataRepo.
"""
from app.repos import MetadataRepo


def get_tables_fields_types():
    """Return list of {table_name, field_name, field_type} for columns, functions, triggers."""
    return MetadataRepo().get_tables_fields_types()
