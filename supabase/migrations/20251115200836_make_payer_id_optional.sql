/*
  # Make payer_id Optional in Assets Table

  1. Changes
    - Remove NOT NULL constraint from payer_id column
    - Allow assets to exist without a payer_id
    - Disable validation rules that require payer_id

  2. Notes
    - Payer ID is now optional
    - Asset ID and other required fields remain mandatory
*/

-- Make payer_id nullable
ALTER TABLE assets 
ALTER COLUMN payer_id DROP NOT NULL;

-- Disable validation rules that require numeric format for payer_id when it can be NULL
UPDATE validation_rules
SET enabled = false
WHERE entity_type = 'asset' 
AND field_name = 'payer_id'
AND rule_type = 'numeric';
