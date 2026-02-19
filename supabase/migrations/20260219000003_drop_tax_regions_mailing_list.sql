-- Drop tax_regions_mailing_list table and related objects (app now uses operators for email).
-- Idempotent: uses IF EXISTS.

DROP TABLE IF EXISTS tax_regions_mailing_list CASCADE;
DROP FUNCTION IF EXISTS update_tax_regions_mailing_list_updated_at();
