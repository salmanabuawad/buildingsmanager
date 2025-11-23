/*
  # Create 200 Sample Assets for Building 1004
  
  1. Changes
    - Insert 200 sample assets with varied data
    - Building number: 1004
    - Asset IDs: 1001-1200
    - Mix of different asset types, sizes, and configurations
    - Some with sub-assets (for types 199 and 299)
    - Random payer IDs
    - Current date as measurement date
*/

-- Generate current date in DD/MM/YYYY format
DO $$
DECLARE
  current_date_str TEXT;
  asset_counter INTEGER;
  asset_id_val BIGINT;
  payer_id_val TEXT;
  main_type TEXT;
  asset_size_val NUMERIC;
  sub_type_1 TEXT;
  sub_size_1 NUMERIC;
  sub_type_2 TEXT;
  sub_size_2 NUMERIC;
  sub_type_3 TEXT;
  sub_size_3 NUMERIC;
  sub_type_4 TEXT;
  sub_size_4 NUMERIC;
  sub_type_5 TEXT;
  sub_size_5 NUMERIC;
  sub_type_6 TEXT;
  sub_size_6 NUMERIC;
BEGIN
  -- Get current date in DD/MM/YYYY format
  current_date_str := TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY');
  
  -- Insert 200 assets
  FOR asset_counter IN 1..200 LOOP
    asset_id_val := 1000 + asset_counter;
    payer_id_val := LPAD((1000 + (asset_counter * 7) % 9999)::TEXT, 9, '0');
    
    -- Vary asset types (using common types: 211, 212, 213, 214, 221, 222, etc.)
    -- Some assets will be type 199 or 299 (complex types with sub-assets)
    CASE (asset_counter % 20)
      WHEN 0 THEN
        -- Type 199 (complex, needs sub-assets)
        main_type := '199';
        asset_size_val := 150.0 + (asset_counter % 50) * 2.5;
        sub_type_1 := '211';
        sub_size_1 := asset_size_val * 0.4;
        sub_type_2 := '212';
        sub_size_2 := asset_size_val * 0.6;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
        sub_type_4 := NULL;
        sub_size_4 := NULL;
        sub_type_5 := NULL;
        sub_size_5 := NULL;
        sub_type_6 := NULL;
        sub_size_6 := NULL;
      WHEN 1 THEN
        -- Type 299 (complex, needs sub-assets)
        main_type := '299';
        asset_size_val := 200.0 + (asset_counter % 40) * 3.0;
        sub_type_1 := '213';
        sub_size_1 := asset_size_val * 0.35;
        sub_type_2 := '214';
        sub_size_2 := asset_size_val * 0.35;
        sub_type_3 := '221';
        sub_size_3 := asset_size_val * 0.30;
        sub_type_4 := NULL;
        sub_size_4 := NULL;
        sub_type_5 := NULL;
        sub_size_5 := NULL;
        sub_type_6 := NULL;
        sub_size_6 := NULL;
      WHEN 2 THEN
        main_type := '211';
        asset_size_val := 80.0 + (asset_counter % 30) * 2.0;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
      WHEN 3 THEN
        main_type := '212';
        asset_size_val := 100.0 + (asset_counter % 35) * 2.5;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
      WHEN 4 THEN
        main_type := '213';
        asset_size_val := 90.0 + (asset_counter % 25) * 2.0;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
        sub_type_4 := NULL;
        sub_size_4 := NULL;
        sub_type_5 := NULL;
        sub_size_5 := NULL;
        sub_type_6 := NULL;
        sub_size_6 := NULL;
      WHEN 5 THEN
        main_type := '214';
        asset_size_val := 70.0 + (asset_counter % 20) * 1.5;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
      WHEN 6 THEN
        main_type := '221';
        asset_size_val := 110.0 + (asset_counter % 30) * 2.0;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
      WHEN 7 THEN
        main_type := '222';
        asset_size_val := 120.0 + (asset_counter % 32) * 2.5;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
      ELSE
        -- Other common types
        main_type := CASE (asset_counter % 8)
          WHEN 0 THEN '211'
          WHEN 1 THEN '212'
          WHEN 2 THEN '213'
          WHEN 3 THEN '214'
          WHEN 4 THEN '221'
          WHEN 5 THEN '222'
          WHEN 6 THEN '223'
          ELSE '224'
        END;
        asset_size_val := 75.0 + (asset_counter % 40) * 2.0;
        sub_type_1 := NULL;
        sub_size_1 := NULL;
        sub_type_2 := NULL;
        sub_size_2 := NULL;
        sub_type_3 := NULL;
        sub_size_3 := NULL;
        sub_type_4 := NULL;
        sub_size_4 := NULL;
        sub_type_5 := NULL;
        sub_size_5 := NULL;
        sub_type_6 := NULL;
        sub_size_6 := NULL;
    END CASE;
    
    -- Insert the asset
    INSERT INTO assets (
      building_number,
      asset_id,
      payer_id,
      main_asset_type,
      asset_size,
      sub_asset_type_1,
      sub_asset_size_1,
      sub_asset_type_2,
      sub_asset_size_2,
      sub_asset_type_3,
      sub_asset_size_3,
      sub_asset_type_4,
      sub_asset_size_4,
      sub_asset_type_5,
      sub_asset_size_5,
      sub_asset_type_6,
      sub_asset_size_6,
      measurement_date
    ) VALUES (
      1004,
      asset_id_val,
      payer_id_val,
      main_type,
      asset_size_val,
      sub_type_1,
      sub_size_1,
      sub_type_2,
      sub_size_2,
      sub_type_3,
      sub_size_3,
      sub_type_4,
      sub_size_4,
      sub_type_5,
      sub_size_5,
      sub_type_6,
      sub_size_6,
      current_date_str
    );
  END LOOP;
  
  RAISE NOTICE 'Inserted 200 sample assets for building 1004';
END $$;

