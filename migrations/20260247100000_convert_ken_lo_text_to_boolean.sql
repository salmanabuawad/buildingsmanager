/*
  Convert all columns that store "כן"/"לא" (or null) from TEXT to BOOLEAN.
  Rules: "כן" → true; null, "לא", or any other value → false.
  (asset_types.active: default true for new rows; null/"לא" → false.)

  Idempotent: only alters columns that are still data_type = 'text'.
  Covers: buildings, assets, assets_history, asset_types.
*/

DO $$
DECLARE
  r RECORD;
  alter_sql text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('buildings', 'elevator', 'false', true),
      ('buildings', 'single_double_family', 'false', true),
      ('buildings', 'condo', 'false', true),
      ('buildings', 'townhouses', 'false', true),
      ('assets', 'elevator', 'false', false),
      ('assets', 'single_double_family', 'false', false),
      ('assets', 'condo', 'false', false),
      ('assets', 'townhouses', 'false', false),
      ('assets', 'penthouse', 'false', false),
      ('assets', 'exported_to_automation', 'false', true),
      ('assets', 'is_new_measurement', 'false', true),
      ('assets', 'data_from_automation', 'false', true),
      ('assets_history', 'elevator', 'false', false),
      ('assets_history', 'single_double_family', 'false', false),
      ('assets_history', 'condo', 'false', false),
      ('assets_history', 'townhouses', 'false', false),
      ('assets_history', 'penthouse', 'false', false),
      ('assets_history', 'exported_to_automation', 'false', true),
      ('assets_history', 'data_from_automation', 'false', true),
      ('asset_types', 'active', 'true', true),
      ('asset_types', 'elevator', 'false', true),
      ('asset_types', 'single_double_family', 'false', true),
      ('asset_types', 'penthouse', 'false', true),
      ('asset_types', 'condo', 'false', true),
      ('asset_types', 'townhouses', 'false', true),
      ('asset_types', 'non_accountable_for_total_area', 'false', true),
      ('asset_types', 'non_accountable_for_distribution', 'false', true),
      ('asset_types', 'not_accountable_for_statistics', 'false', true),
      ('asset_types', 'use_shared_area', 'false', false),
      ('asset_types', 'use_for_parking_shared_area', 'false', false)
    ) AS t(tablename, columnname, default_val, set_not_null)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = r.tablename
        AND c.column_name = r.columnname AND c.data_type = 'text'
    ) THEN
      -- USING: "כן" or true/1/yes/t → true; null, "לא", other → false
      alter_sql := format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE boolean USING ('
        '(TRIM(COALESCE(%I::text, '''')) = ''כן'') OR (LOWER(TRIM(COALESCE(%I::text, '''')))) IN (''true'', ''1'', ''yes'', ''t''))',
        r.tablename, r.columnname, r.columnname, r.columnname
      );
      EXECUTE alter_sql;

      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s',
        r.tablename, r.columnname, r.default_val
      );
      IF r.set_not_null THEN
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN %I SET NOT NULL',
          r.tablename, r.columnname
        );
      END IF;
    END IF;
  END LOOP;
END $$;
