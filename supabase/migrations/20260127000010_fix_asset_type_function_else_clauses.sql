/*
  Migration: Fix ELSE clauses in update_asset_type_with_distribution_reset function
  
  This migration fixes the CASE statements to ensure ELSE clauses return BOOLEAN
  even if the database column is still TEXT (for backward compatibility during migration).
*/

CREATE OR REPLACE FUNCTION update_asset_type_with_distribution_reset(
  p_id bigint,
  p_updates jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_asset_type_name text;
  v_old_non_accountable_for_distribution boolean;
  v_new_non_accountable_for_distribution boolean;
  v_affected_buildings bigint[];
  v_building_number bigint;
  v_business_residence text;
BEGIN
  -- Get before data
  SELECT row_to_json(at.*)::jsonb INTO v_before_data
  FROM asset_types at
  WHERE at.id = p_id;
  
  IF v_before_data IS NULL THEN
    RAISE EXCEPTION 'Asset type with id % not found', p_id;
  END IF;
  
  v_asset_type_name := v_before_data->>'name';
  v_old_non_accountable_for_distribution := COALESCE((v_before_data->>'non_accountable_for_distribution')::boolean, false);
  
  -- Check if non_accountable_for_distribution is being changed
  IF p_updates ? 'non_accountable_for_distribution' THEN
    v_new_non_accountable_for_distribution := CASE
      WHEN jsonb_typeof(p_updates->'non_accountable_for_distribution') = 'boolean' THEN (p_updates->>'non_accountable_for_distribution')::boolean
      WHEN jsonb_typeof(p_updates->'non_accountable_for_distribution') = 'string' AND (p_updates->>'non_accountable_for_distribution')::text IN ('true', 'TRUE', '1', 'כן') THEN true
      WHEN jsonb_typeof(p_updates->'non_accountable_for_distribution') = 'string' AND (p_updates->>'non_accountable_for_distribution')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
      ELSE false
    END;
    
    -- Update the asset type
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE
        WHEN p_updates ? 'elevator' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'elevator') = 'boolean' THEN (p_updates->'elevator')::boolean
            WHEN jsonb_typeof(p_updates->'elevator') = 'string' AND (p_updates->>'elevator')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'elevator') = 'string' AND (p_updates->>'elevator')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN elevator::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN elevator::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          elevator::boolean
        )
      END,
      single_double_family = CASE
        WHEN p_updates ? 'single_double_family' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'single_double_family') = 'boolean' THEN (p_updates->'single_double_family')::boolean
            WHEN jsonb_typeof(p_updates->'single_double_family') = 'string' AND (p_updates->>'single_double_family')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'single_double_family') = 'string' AND (p_updates->>'single_double_family')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN single_double_family::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN single_double_family::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          single_double_family::boolean
        )
      END,
      penthouse = CASE
        WHEN p_updates ? 'penthouse' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'penthouse') = 'boolean' THEN (p_updates->'penthouse')::boolean
            WHEN jsonb_typeof(p_updates->'penthouse') = 'string' AND (p_updates->>'penthouse')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'penthouse') = 'string' AND (p_updates->>'penthouse')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN penthouse::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN penthouse::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          penthouse::boolean
        )
      END,
      condo = CASE
        WHEN p_updates ? 'condo' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'condo') = 'boolean' THEN (p_updates->'condo')::boolean
            WHEN jsonb_typeof(p_updates->'condo') = 'string' AND (p_updates->>'condo')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'condo') = 'string' AND (p_updates->>'condo')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN condo::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN condo::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          condo::boolean
        )
      END,
      townhouses = CASE
        WHEN p_updates ? 'townhouses' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'townhouses') = 'boolean' THEN (p_updates->'townhouses')::boolean
            WHEN jsonb_typeof(p_updates->'townhouses') = 'string' AND (p_updates->>'townhouses')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'townhouses') = 'string' AND (p_updates->>'townhouses')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE CASE
          WHEN pg_typeof(townhouses) = 'boolean'::regtype THEN townhouses::boolean
          ELSE (townhouses::text IN ('כן', 'true', 'TRUE', '1'))
        END
      END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      non_accountable_for_total_area = CASE
        WHEN p_updates ? 'non_accountable_for_total_area' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'non_accountable_for_total_area') = 'boolean' THEN (p_updates->'non_accountable_for_total_area')::boolean
            WHEN jsonb_typeof(p_updates->'non_accountable_for_total_area') = 'string' AND (p_updates->>'non_accountable_for_total_area')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'non_accountable_for_total_area') = 'string' AND (p_updates->>'non_accountable_for_total_area')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN non_accountable_for_total_area::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN non_accountable_for_total_area::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          non_accountable_for_total_area::boolean
        )
      END,
      non_accountable_for_distribution = v_new_non_accountable_for_distribution,
      not_accountable_for_statistics = CASE
        WHEN p_updates ? 'not_accountable_for_statistics' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'not_accountable_for_statistics') = 'boolean' THEN (p_updates->'not_accountable_for_statistics')::boolean
            WHEN jsonb_typeof(p_updates->'not_accountable_for_statistics') = 'string' AND (p_updates->>'not_accountable_for_statistics')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'not_accountable_for_statistics') = 'string' AND (p_updates->>'not_accountable_for_statistics')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE CASE
          WHEN not_accountable_for_statistics::text IN ('כן', 'true', 'TRUE', '1') THEN true
          WHEN not_accountable_for_statistics::text IN ('לא', 'false', 'FALSE', '0', '') THEN false
          ELSE not_accountable_for_statistics::boolean
        END
      END,
      use_shared_area = CASE
        WHEN p_updates ? 'use_shared_area' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'use_shared_area') = 'boolean' THEN (p_updates->'use_shared_area')::boolean
            WHEN jsonb_typeof(p_updates->'use_shared_area') = 'string' AND (p_updates->>'use_shared_area')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'use_shared_area') = 'string' AND (p_updates->>'use_shared_area')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE CASE
          WHEN use_shared_area IS NULL THEN NULL
          ELSE COALESCE(
            CASE WHEN use_shared_area::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
            CASE WHEN use_shared_area::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
            use_shared_area::boolean
          )
        END
      END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = CASE
        WHEN p_updates ? 'active' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'active') = 'boolean' THEN (p_updates->'active')::boolean
            WHEN jsonb_typeof(p_updates->'active') = 'string' AND (p_updates->>'active')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'active') = 'string' AND (p_updates->>'active')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN active::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN active::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          active::boolean
        )
      END,
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
    
    -- If non_accountable_for_distribution changed, reset flags for affected buildings
    -- Only set the flag for the relevant business/residence type
    IF v_old_non_accountable_for_distribution IS DISTINCT FROM v_new_non_accountable_for_distribution THEN
      -- Get the asset type's business_residence field to determine which flag to set
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE id = p_id;
      
      -- Find all buildings with assets of this type
      SELECT ARRAY_AGG(DISTINCT building_number) INTO v_affected_buildings
      FROM assets
      WHERE main_asset_type = v_asset_type_name
        AND building_number IS NOT NULL;
      
      -- Set flag based on business_residence type
      -- (true = needs distribution, false = already distributed)
      IF v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN
        IF v_business_residence = 'עסקים' THEN
          -- Business type: only set business distribution flag
          UPDATE buildings
          SET need_business_distribution = true
          WHERE building_number = ANY(v_affected_buildings);
        ELSIF v_business_residence = 'מגורים' THEN
          -- Residence type: only set residence distribution flag
          UPDATE buildings
          SET need_residence_distribution = true
          WHERE building_number = ANY(v_affected_buildings);
        ELSE
          -- Unknown type: set both flags to be safe
          UPDATE buildings
          SET need_business_distribution = true,
              need_residence_distribution = true
          WHERE building_number = ANY(v_affected_buildings);
        END IF;
      END IF;
    END IF;
  ELSE
    -- Update without checking distribution flag (field not changed)
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE
        WHEN p_updates ? 'elevator' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'elevator') = 'boolean' THEN (p_updates->'elevator')::boolean
            WHEN jsonb_typeof(p_updates->'elevator') = 'string' AND (p_updates->>'elevator')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'elevator') = 'string' AND (p_updates->>'elevator')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN elevator::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN elevator::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          elevator::boolean
        )
      END,
      single_double_family = CASE
        WHEN p_updates ? 'single_double_family' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'single_double_family') = 'boolean' THEN (p_updates->'single_double_family')::boolean
            WHEN jsonb_typeof(p_updates->'single_double_family') = 'string' AND (p_updates->>'single_double_family')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'single_double_family') = 'string' AND (p_updates->>'single_double_family')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN single_double_family::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN single_double_family::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          single_double_family::boolean
        )
      END,
      penthouse = CASE
        WHEN p_updates ? 'penthouse' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'penthouse') = 'boolean' THEN (p_updates->'penthouse')::boolean
            WHEN jsonb_typeof(p_updates->'penthouse') = 'string' AND (p_updates->>'penthouse')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'penthouse') = 'string' AND (p_updates->>'penthouse')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN penthouse::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN penthouse::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          penthouse::boolean
        )
      END,
      condo = CASE
        WHEN p_updates ? 'condo' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'condo') = 'boolean' THEN (p_updates->'condo')::boolean
            WHEN jsonb_typeof(p_updates->'condo') = 'string' AND (p_updates->>'condo')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'condo') = 'string' AND (p_updates->>'condo')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN condo::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN condo::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          condo::boolean
        )
      END,
      townhouses = CASE
        WHEN p_updates ? 'townhouses' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'townhouses') = 'boolean' THEN (p_updates->'townhouses')::boolean
            WHEN jsonb_typeof(p_updates->'townhouses') = 'string' AND (p_updates->>'townhouses')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'townhouses') = 'string' AND (p_updates->>'townhouses')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE CASE
          WHEN pg_typeof(townhouses) = 'boolean'::regtype THEN townhouses::boolean
          ELSE (townhouses::text IN ('כן', 'true', 'TRUE', '1'))
        END
      END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      non_accountable_for_total_area = CASE
        WHEN p_updates ? 'non_accountable_for_total_area' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'non_accountable_for_total_area') = 'boolean' THEN (p_updates->'non_accountable_for_total_area')::boolean
            WHEN jsonb_typeof(p_updates->'non_accountable_for_total_area') = 'string' AND (p_updates->>'non_accountable_for_total_area')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'non_accountable_for_total_area') = 'string' AND (p_updates->>'non_accountable_for_total_area')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN non_accountable_for_total_area::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN non_accountable_for_total_area::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          non_accountable_for_total_area::boolean
        )
      END,
      not_accountable_for_statistics = CASE
        WHEN p_updates ? 'not_accountable_for_statistics' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'not_accountable_for_statistics') = 'boolean' THEN (p_updates->'not_accountable_for_statistics')::boolean
            WHEN jsonb_typeof(p_updates->'not_accountable_for_statistics') = 'string' AND (p_updates->>'not_accountable_for_statistics')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'not_accountable_for_statistics') = 'string' AND (p_updates->>'not_accountable_for_statistics')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE CASE
          WHEN not_accountable_for_statistics::text IN ('כן', 'true', 'TRUE', '1') THEN true
          WHEN not_accountable_for_statistics::text IN ('לא', 'false', 'FALSE', '0', '') THEN false
          ELSE not_accountable_for_statistics::boolean
        END
      END,
      use_shared_area = CASE
        WHEN p_updates ? 'use_shared_area' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'use_shared_area') = 'boolean' THEN (p_updates->'use_shared_area')::boolean
            WHEN jsonb_typeof(p_updates->'use_shared_area') = 'string' AND (p_updates->>'use_shared_area')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'use_shared_area') = 'string' AND (p_updates->>'use_shared_area')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE CASE
          WHEN use_shared_area IS NULL THEN NULL
          ELSE COALESCE(
            CASE WHEN use_shared_area::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
            CASE WHEN use_shared_area::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
            use_shared_area::boolean
          )
        END
      END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = CASE
        WHEN p_updates ? 'active' THEN 
          CASE 
            WHEN jsonb_typeof(p_updates->'active') = 'boolean' THEN (p_updates->'active')::boolean
            WHEN jsonb_typeof(p_updates->'active') = 'string' AND (p_updates->>'active')::text IN ('true', 'TRUE', '1', 'כן') THEN true
            WHEN jsonb_typeof(p_updates->'active') = 'string' AND (p_updates->>'active')::text IN ('false', 'FALSE', '0', 'לא', '') THEN false
            ELSE false
          END
        ELSE COALESCE(
          CASE WHEN active::text IN ('כן', 'true', 'TRUE', '1') THEN true ELSE NULL END,
          CASE WHEN active::text IN ('לא', 'false', 'FALSE', '0', '') THEN false ELSE NULL END,
          active::boolean
        )
      END,
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
  END IF;
  
  -- Return result with before/after data and affected buildings
  RETURN jsonb_build_object(
    'before_data', v_before_data,
    'after_data', v_after_data,
    'affected_buildings', COALESCE(v_affected_buildings, ARRAY[]::bigint[]),
    'distribution_flags_reset', CASE WHEN v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN true ELSE false END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_asset_type_with_distribution_reset IS 'Update asset type and reset business distribution flags for affected buildings if non_accountable_for_distribution changed. All in a single transaction. Supports boolean checkbox fields. Handles both TEXT and BOOLEAN column types for backward compatibility.';
