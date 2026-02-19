/*
  # Seed email_config in system_configuration
  
  Inserts Gmail SMTP configuration with sender profile.group.system@gmail.com and app password.
  If this repo is shared or public, rotate the Gmail App Password after applying.
*/

INSERT INTO system_configuration (name, value, description, created_by, updated_by)
VALUES (
  'email_config',
  '{"smtp_host":"smtp.gmail.com","smtp_port":587,"smtp_encryption":"tls","smtp_username":"profile.group.system@gmail.com","smtp_password":"iqgqkyfsxdklidsp","from_email":"profile.group.system@gmail.com","from_name":""}'::text,
  'הגדרות SMTP לשליחת דוא"ל',
  'migration',
  'migration'
)
ON CONFLICT (name) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
