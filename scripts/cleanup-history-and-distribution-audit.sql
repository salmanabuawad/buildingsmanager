-- ─────────────────────────────────────────────────────────────────────────────
-- One-time cleanup, run via psql -f:
--   1. assets_history  : keep only the LATEST historical row per asset_id.
--   2. audit (distribution): per building per action_type, keep only the
--      entries from the LATEST distribution run; delete older runs.
--
-- Wrapped in a single transaction — if any step errors, nothing is deleted.
-- CSV backups are written via client-side \copy BEFORE the transaction.
-- ─────────────────────────────────────────────────────────────────────────────

\copy (SELECT * FROM assets_history) TO '/tmp/assets_history.backup.csv' WITH CSV HEADER
\copy (SELECT * FROM audit WHERE action_type IN ('business_distribution','residence_distribution')) TO '/tmp/audit_distribution.backup.csv' WITH CSV HEADER

\echo
\echo === BEFORE COUNTS ===
SELECT 'assets_history' AS tbl, COUNT(*) AS rows FROM assets_history
UNION ALL SELECT 'audit_distribution_asset', COUNT(*) FROM audit
  WHERE entity_type='asset' AND action_type IN ('business_distribution','residence_distribution')
UNION ALL SELECT 'audit_distribution_bulk_asset', COUNT(*) FROM audit
  WHERE entity_type='bulk_asset' AND action_type IN ('business_distribution','residence_distribution');

BEGIN;

-- (1) assets_history: keep only the row with max history_created_at per asset_id
WITH ranked AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY asset_id
           ORDER BY history_created_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM assets_history
)
DELETE FROM assets_history ah
USING ranked r
WHERE ah.ctid = r.ctid AND r.rn > 1;

-- (2a) asset distribution audit: keep only the latest run per building per action_type
WITH building_latest AS (
  SELECT a.building_number, au.action_type, MAX(au.created_at) AS latest_at
  FROM audit au
  JOIN assets a ON au.entity_id = a.asset_id::text
  WHERE au.entity_type='asset'
    AND au.action_type IN ('business_distribution','residence_distribution')
  GROUP BY a.building_number, au.action_type
)
DELETE FROM audit au
USING assets a, building_latest bl
WHERE au.entity_id = a.asset_id::text
  AND a.building_number = bl.building_number
  AND au.action_type = bl.action_type
  AND au.entity_type='asset'
  AND au.action_type IN ('business_distribution','residence_distribution')
  AND au.created_at < bl.latest_at;

-- (2b) bulk_asset distribution audit: keep only the latest per building per action_type
DELETE FROM audit au
USING (
  SELECT entity_id, action_type, MAX(created_at) AS latest_at
  FROM audit
  WHERE entity_type='bulk_asset'
    AND action_type IN ('business_distribution','residence_distribution')
  GROUP BY entity_id, action_type
) blb
WHERE au.entity_type='bulk_asset'
  AND au.action_type IN ('business_distribution','residence_distribution')
  AND au.entity_id = blb.entity_id
  AND au.action_type = blb.action_type
  AND au.created_at < blb.latest_at;

COMMIT;

\echo
\echo === AFTER COUNTS ===
SELECT 'assets_history' AS tbl, COUNT(*) AS rows FROM assets_history
UNION ALL SELECT 'audit_distribution_asset', COUNT(*) FROM audit
  WHERE entity_type='asset' AND action_type IN ('business_distribution','residence_distribution')
UNION ALL SELECT 'audit_distribution_bulk_asset', COUNT(*) FROM audit
  WHERE entity_type='bulk_asset' AND action_type IN ('business_distribution','residence_distribution');

\echo
\echo === backups: /tmp/assets_history.backup.csv  +  /tmp/audit_distribution.backup.csv ===
