# Critical Architecture

## Non-Negotiable Direction

The target architecture for this system is:

- `React` for UI composition and interaction
- `FastAPI/Python` for validation, orchestration, and transactions
- `Postgres` for storage and integrity constraints
- `Nginx` for static delivery and reverse proxying

Business logic must not be implemented in `Postgres` triggers or stored functions.

## Core Rules

### 1. Validate before write

All write flows must validate before committing data.

### 2. One transaction per business operation

If a workflow updates assets, totals, flags, and audit logs, the full workflow must run inside one Python-managed transaction.

### 3. Thin routers, thick services

FastAPI routers should parse input, call service-layer functions, and return typed responses. Business rules belong in Python services, not route handlers and not the database.

### 4. Database as integrity boundary

Use Postgres for:

- tables
- indexes
- foreign keys
- unique constraints
- check constraints

Do not use Postgres for:

- save orchestration
- audit orchestration
- totals recalculation workflows
- hidden side effects after writes

### 5. Predictable frontend boundaries

React components should call typed API/service helpers, not manually coordinate multiple persistence steps.

## Allowed

- Python service opens a transaction, writes multiple tables, and commits or rolls back atomically
- Repository/query helpers called from Python services
- Database constraints rejecting invalid states
- Read-only views when they simplify reporting

## Forbidden

- Triggers that update totals or flags after asset writes
- Stored functions that perform save + audit + recalculation workflows
- Hidden DB side effects the API layer does not control
- Frontend code orchestrating multi-step persistence directly

## Refactor Direction

Preferred migration path:

1. Move orchestration into FastAPI service-layer transactions
2. Keep validation mandatory
3. Keep DB constraints intact
4. Remove DB-side business logic instead of adding more

## Review Checklist

Before merging backend workflow changes, verify:

- validation still happens before commit
- one Python transaction covers the whole business operation
- no new triggers or stored business functions were added
- schema constraints still protect data integrity
- API contracts remain explicit and typed
- tests cover success and rollback paths
