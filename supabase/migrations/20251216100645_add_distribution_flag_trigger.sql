/*
  # Add Distribution Flag Trigger

  1. Overview
    - Creates a database trigger that automatically sets distribution flags
    - Triggers when asset main_asset_type changes to/from non_accountable types
    - Keeps business logic in database, audit log stays clean

  2. Logic
    - Fires AFTER INSERT OR UPDATE on assets table
    - Checks if main_asset_type changed
    - Looks up asset_type to check non_accountable_for_distribution flag
    - Sets appropriate distribution flags on buildings table based on business_residence

  3. Benefits
    - Single source of truth for distribution flag logic
    - Works for ALL update paths (Transform tab, Transfer Areas, direct DB updates)
    - Audit log functions remain pure (only record data)
*/

-- Function to automatically set distribution flags when asset type changes
CREATE OR REPLACE FUNCTION auto_set_distribution_flags()
RETURNS TRIGGER AS $$
DECLARE
  v_old_type TEXT;
  v_new_type TEXT;
  v_old_type_data RECORD;
  v_new_type_data RECORD;
  v_old_is_non_accountable BOOLEAN;
  v_new_is_non_accountable BOOLEAN;
  v_business_residence TEXT;
BEGIN
  -- Only process if main_asset_type changed (or new insert)
  IF TG_OP = 'INSERT' THEN
    v_old_type := NULL;
    v_new_type := NEW.main_asset_type;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_type := OLD.main_asset_type;
    v_new_type := NEW.main_asset_type;

    -- Exit early if type didn't change
    IF v_old_type = v_new_type OR v_old_type IS NOT DISTINCT FROM v_new_type THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Skip if no building_number
  IF NEW.building_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup old asset type data
  IF v_old_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_old_type_data
    FROM asset_types
    WHERE name = v_old_type;

    v_old_is_non_accountable := COALESCE(v_old_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_old_is_non_accountable := FALSE;
  END IF;

  -- Lookup new asset type data
  IF v_new_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_new_type_data
    FROM asset_types
    WHERE name = v_new_type;

    v_new_is_non_accountable := COALESCE(v_new_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_new_is_non_accountable := FALSE;
  END IF;

  -- Only set flags if changing to/from non_accountable type
  IF v_old_is_non_accountable OR v_new_is_non_accountable THEN
    -- Use the new type's business_residence, fall back to old type
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);

    -- Set appropriate distribution flag(s)
    IF v_business_residence = 'עסקים' THEN
      -- Business type
      UPDATE buildings
      SET need_business_distribution = TRUE
      WHERE building_number = NEW.building_number;

      RAISE NOTICE '[DB Trigger] Set need_business_distribution=true for building % (asset type changed to/from non_accountable business type)', NEW.building_number;

    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence type
      UPDATE buildings
      SET need_residence_distribution = TRUE
      WHERE building_number = NEW.building_number;

      RAISE NOTICE '[DB Trigger] Set need_residence_distribution=true for building % (asset type changed to/from non_accountable residence type)', NEW.building_number;

    ELSE
      -- Unknown type or NULL: set both flags to be safe
      UPDATE buildings
      SET need_business_distribution = TRUE,
          need_residence_distribution = TRUE
      WHERE building_number = NEW.building_number;

      RAISE NOTICE '[DB Trigger] Set both distribution flags for building % (asset type changed to/from non_accountable unknown type)', NEW.building_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags ON assets;

-- Create trigger that fires after insert or update
CREATE TRIGGER trigger_auto_set_distribution_flags
  AFTER INSERT OR UPDATE OF main_asset_type ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags();

COMMENT ON FUNCTION auto_set_distribution_flags IS 'Automatically sets building distribution flags when asset main_asset_type changes to/from non_accountable_for_distribution types';
COMMENT ON TRIGGER trigger_auto_set_distribution_flags ON assets IS 'Triggers distribution flag updates when asset types change';
