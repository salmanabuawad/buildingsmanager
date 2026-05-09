"""
Shared serialization utilities for router modules.
"""
from datetime import datetime, date
from decimal import Decimal
from typing import Any


def serialize_value(v: Any) -> Any:
    """Serialize a single value for JSON output (handles datetime, date, Decimal)."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def row_to_dict(row) -> dict:
    """Convert a SQLAlchemy RowMapping to a JSON-serializable dict."""
    if row is None:
        return None
    m = row._mapping
    return {k: serialize_value(m[k]) for k in m.keys()}
