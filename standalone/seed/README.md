# Seed data

This directory holds SQL seed data for the local DB.

## Apply SQL seed to local DB

With `DATABASE_URL` set (e.g. from `backend/.env`):

```bash
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/buildingsmanager
python scripts/apply_seed.py
```

Or run full setup including seed: `python scripts/setup_local_db.py --seed` (only if `standalone/seed/*.sql` exists).

Seed files (e.g. `01_address_list.sql`, `02_validation_rules.sql`, …) must be in FK-safe order. Create them manually or from a backup of your DB.

## Boolean columns (כן/לא → true/false)

If your DB still has text columns for elevator, condo, active, etc., run:

```bash
python scripts/apply_boolean_migration.py
```

Or apply `migrations/20260247100000_convert_ken_lo_text_to_boolean.sql` via SQL. The migration is idempotent.
