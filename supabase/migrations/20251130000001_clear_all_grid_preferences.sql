-- Clear all grid column state preferences
-- This will reset all grid column widths, positions, and visibility to defaults

DELETE FROM user_preferences 
WHERE preference_key LIKE '%_column_state';

-- Add comment
COMMENT ON TABLE user_preferences IS 'User preferences including grid column states. Grid preferences can be cleared by deleting rows where preference_key ends with "_column_state".';

