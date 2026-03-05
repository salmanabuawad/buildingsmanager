"""
Metadata repository: DB access for information_schema (tables, columns, functions, triggers).
"""
from typing import List

from app.repos.base_repo import BaseRepo


class MetadataRepo(BaseRepo):
    def get_tables_fields_types(self) -> List[dict]:
        """Return list of {table_name, field_name, field_type} for columns, functions, triggers."""
        out = []
        cols = self._fetch("""
            SELECT c.table_name::text AS table_name,
                   c.column_name::text AS field_name,
                   CASE
                     WHEN c.character_maximum_length IS NOT NULL
                     THEN c.data_type || '(' || c.character_maximum_length || ')'
                     WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
                     THEN c.data_type || '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                     WHEN c.numeric_precision IS NOT NULL
                     THEN c.data_type || '(' || c.numeric_precision || ')'
                     ELSE c.data_type
                   END::text AS field_type
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
            ORDER BY c.table_name, c.ordinal_position
        """)
        out.extend(cols)
        funcs = self._fetch("""
            SELECT 'FUNCTION'::text AS table_name,
                   (n.nspname || '.' || p.proname || '(' || COALESCE(pg_get_function_arguments(p.oid), '') || ')')::text AS field_name,
                   pg_get_functiondef(p.oid)::text AS field_type
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
            ORDER BY p.proname
        """)
        out.extend(funcs)
        trigs = self._fetch("""
            SELECT 'TRIGGER'::text AS table_name,
                   (n.nspname || '.' || t.tgname || ' ON ' || c.relname)::text AS field_name,
                   pg_get_triggerdef(t.oid)::text AS field_type
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = 'public' AND NOT t.tgisinternal
            ORDER BY c.relname, t.tgname
        """)
        out.extend(trigs)
        return out
