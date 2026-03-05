-- Add default inspector user: inspector / inspector123 (role: inspector)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (user_name, user_email, user_role, password_hash, active, created_at, updated_at)
SELECT
  'inspector',
  'inspector@buildingsmanager.local',
  'inspector',
  crypt('inspector123', gen_salt('bf')),
  true,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'inspector');

UPDATE users
SET auth_user_id = 'uid:' || user_id
WHERE user_name = 'inspector'
  AND (auth_user_id IS NULL OR auth_user_id NOT LIKE 'uid:%');
