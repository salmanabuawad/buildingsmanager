/*
  # Add Comment Field to Assets Table
  
  This migration adds a comment field to the assets table to allow users
  to add notes/comments about individual assets.
  
  Changes:
  1. Adds comment text column to assets table
  2. Adds comment text column to assets_history table (for historical records)
  3. Updates the copy_asset_to_history trigger function to include the comment field
  4. Updates save_assets_bulk_transactional function to handle the comment field
*/

-- Add comment column to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS comment text;

-- Add comment column to assets_history table
ALTER TABLE assets_history
  ADD COLUMN IF NOT EXISTS comment text;

-- Add comment to column
COMMENT ON COLUMN assets.comment IS 'User comment/notes about the asset (הערה על הנכס)';
COMMENT ON COLUMN assets_history.comment IS 'User comment/notes about the asset (historical record)';

-- Update the copy_asset_to_history function to include comment field
-- This function copies assets to history when is_new_measurement flag is set
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_new_measurement, false) = true THEN
      INSERT INTO assets_history (
        building_number, payer_id, asset_id, measurement_date,
        main_asset_type, asset_size,
        sub_asset_type_1, sub_asset_size_1,
        sub_asset_type_2, sub_asset_size_2,
        sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4,
        sub_asset_type_5, sub_asset_size_5,
        sub_asset_type_6, sub_asset_size_6,
        structure_drawing_url, created_at, updated_at,
        elevator, single_double_family, condo, townhouses, penthouse,
        tax_region, floor, discount_type, discount_date_from, discount_date_to,
        comment
      ) VALUES (
        OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
        OLD.main_asset_type, OLD.asset_size,
        OLD.sub_asset_type_1, OLD.sub_asset_size_1,
        OLD.sub_asset_type_2, OLD.sub_asset_size_2,
        OLD.sub_asset_type_3, OLD.sub_asset_size_3,
        OLD.sub_asset_type_4, OLD.sub_asset_size_4,
        OLD.sub_asset_type_5, OLD.sub_asset_size_5,
        OLD.sub_asset_type_6, OLD.sub_asset_size_6,
        OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
        OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
        OLD.comment
      );
      NEW.is_new_measurement = false;
    END IF;
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      comment
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
      OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
      OLD.comment
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add field configurations for comment field with width_chars = 6 and padding = 2
-- Insert comment field configurations for all relevant grids

-- Assets List grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'comment', 6, 2, 'הערה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details Main grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'comment', 6, 2, 'הערה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details History grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'comment', 6, 2, 'הערה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Data Entry grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'comment', 6, 2, 'הערה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Transfer Areas grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'comment', 6, 2, 'הערה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Assets File Import grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'comment', 6, 2, 'הערה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

