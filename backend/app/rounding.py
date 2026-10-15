"""
Round area / ratio values to 2 decimal places at the API boundary.

Every JSON body sent to /api/* with POST, PUT or PATCH passes through
RoundDecimalsMiddleware, which rounds the fields in ROUNDED_FIELDS (at any
nesting depth, so bulk payloads and before/after audit snapshots are covered)
before any router sees them. Values the server computes itself (building
net / total area) are rounded with round_2 where they are written.

Rounding is half-up (12.345 -> 12.35), done with Decimal so binary floats
don't round the wrong way (Python's round(2.675, 2) gives 2.67).
"""
import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

ROUNDED_FIELDS = frozenset({
    "asset_size",
    "sub_asset_size_1", "sub_asset_size_2", "sub_asset_size_3",
    "sub_asset_size_4", "sub_asset_size_5", "sub_asset_size_6",
    "business_distribution_area",
    "area_from_distribution",
    "shared_parking_area",
    "shared_area_size",
    "residence_shared_area",
    "business_shared_area",
    "business_total_area",
    "total_building_area",
    "net_area",
    "area_for_control",
    "min_size",
    "max_size",
    "overload_ratio",
})

_CENT = Decimal("0.01")
_WRITE_METHODS = {"POST", "PUT", "PATCH"}


def round_2(value: Any) -> Any:
    """Round a number (or numeric string) half-up to 2 decimals; leave anything else as is."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float, Decimal)):
        rounded = Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)
        return rounded if isinstance(value, Decimal) else float(rounded)
    if isinstance(value, str) and value.strip():
        try:
            return str(Decimal(value.strip()).quantize(_CENT, rounding=ROUND_HALF_UP))
        except InvalidOperation:
            return value
    return value


def round_payload(obj: Any) -> Any:
    """Return obj with every ROUNDED_FIELDS value rounded, recursing into dicts and lists."""
    if isinstance(obj, dict):
        return {
            k: round_2(v) if k in ROUNDED_FIELDS and not isinstance(v, (dict, list)) else round_payload(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [round_payload(v) for v in obj]
    return obj


class RoundDecimalsMiddleware:
    """ASGI middleware: rewrites JSON request bodies of /api/* writes via round_payload."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] != "http"
            or scope["method"] not in _WRITE_METHODS
            or not scope["path"].startswith("/api/")
        ):
            return await self.app(scope, receive, send)

        headers = dict(scope.get("headers") or [])
        if b"application/json" not in headers.get(b"content-type", b""):
            return await self.app(scope, receive, send)

        chunks = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunks.append(message.get("body", b""))
            if not message.get("more_body"):
                break
        body = b"".join(chunks)

        try:
            body = json.dumps(round_payload(json.loads(body)), ensure_ascii=False).encode("utf-8")
        except (ValueError, UnicodeDecodeError):
            pass  # not valid JSON — let the router report it

        scope = dict(scope)
        scope["headers"] = [
            (k, str(len(body)).encode() if k == b"content-length" else v)
            for k, v in scope.get("headers") or []
        ]

        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)
