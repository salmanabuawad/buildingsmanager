"""
Metadata service: schema info (tables, fields, types) in Python.
"""
from app.transactions import metadata as metadata_py


class MetadataService:
    @staticmethod
    def get_tables_fields_types():
        return metadata_py.get_tables_fields_types()
