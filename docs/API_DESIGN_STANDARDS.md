# API design standards

**All API endpoints must follow these patterns. No exceptions.**

## 1. REST conventions

- **URLs**: Resource-based. Use nouns, not verbs.
  - Good: `GET /api/buildings`, `DELETE /api/buildings/{building_number}`
  - Avoid: `POST /api/delete-building`, `POST /api/data/bulk/delete-by-query` for app flows
- **HTTP methods**:
  - `GET` – read (list or single resource)
  - `POST` – create resource or **documented** RPC-style action (e.g. bulk save) with a clear path name
  - `PUT` / `PATCH` – update resource
  - `DELETE` – delete resource (and related data as defined by backend)
- **Identifiers**: Use business keys in paths where appropriate (e.g. `building_number`), not only internal IDs.

## 2. Layered architecture

- **Router**: Thin. Parse path/query/body, call service, return HTTP response. No business logic, no raw SQL.
- **Service**: Orchestrates use cases. Calls transaction/repository layer. Handles validation and error mapping.
- **Transaction / Repository**: Database access, transactions, SQL. No HTTP or request concepts.

Flow: **Router → Service → Transaction (or Repository)**. No skipping layers.

## 3. Business logic in the backend

- **Deletes**: Deletion of a resource (e.g. building) must be done via a **single REST call** (e.g. `DELETE /api/buildings/{building_number}`). The backend performs all related deletes (assets, audit rows, etc.) in one place. The frontend must not chain generic “delete by query” calls to mimic this.
- **Create/Update**: Same idea: one endpoint per use case; backend owns rules and related updates.

## 4. Response and errors

- **Success**: Return `200` with body, or `204` for delete with no body. Use consistent response shapes per resource (e.g. `{ "data": ... }` or direct payload as agreed).
- **Errors**: Use `HTTPException` with appropriate status (`400`, `403`, `404`, `500`) and a clear `detail`. Do not expose raw DB or stack traces to the client.
- **Validation**: Use Pydantic models for request bodies; use `422` for validation errors.

## 5. Auth and security

- **Protected routes**: Use a single auth pattern (e.g. `Depends(get_current_user)`). Apply it consistently to all routes that modify data or return sensitive data.
- **Permissions**: Enforce role/permission checks in the backend (e.g. only admin can delete building). No “generic” mutation endpoints that bypass resource-level checks.

## 6. Generic data endpoints

- **GET /api/data/{table}**: Allowed for read-only, whitelisted tables (list/query). Use for generic grids/lookups.
- **Mutation by “table + filters”**: Not used for normal app flows. Any such endpoint (e.g. bulk delete-by-query) is for internal/admin use only; app features use **resource-specific** endpoints (e.g. `DELETE /api/buildings/{building_number}`).

## 7. Naming and documentation

- **Route paths**: Clear and consistent (e.g. `/api/buildings`, `/api/assets`, `/api/asset-types`).
- **OpenAPI**: Use `summary`/`description` and `tags` for every endpoint. Document request/response where it helps.

---

**Summary**: REST resource URLs and methods, thin routers, business logic in the backend, one REST call per use case, consistent errors and auth, no exceptions.
