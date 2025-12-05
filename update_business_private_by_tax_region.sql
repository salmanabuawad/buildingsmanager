-- Update business_private field based on tax_region
-- For tax_region 40 or 50: set to "עסקים"
-- For all other tax_regions (not null): set to "מגורים"
-- For null tax_region: leave as null

-- Set "עסקים" for tax_region 40 and 50
UPDATE asset_types
SET business_private = 'עסקים',
    updated_at = now()
WHERE tax_region IN (40, 50);

-- Set "מגורים" for all other tax_regions (not null and not 40 or 50)
UPDATE asset_types
SET business_private = 'מגורים',
    updated_at = now()
WHERE tax_region IS NOT NULL 
  AND tax_region NOT IN (40, 50);

-- Optional: Show summary of updates
SELECT 
    tax_region,
    business_private,
    COUNT(*) as count
FROM asset_types
WHERE tax_region IS NOT NULL
GROUP BY tax_region, business_private
ORDER BY tax_region, business_private;

