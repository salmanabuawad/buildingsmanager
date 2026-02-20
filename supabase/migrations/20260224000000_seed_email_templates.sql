-- Seed email templates in system_configuration. Stored in DB; view/upload/download in System Configuration page.
-- Placeholders: {{name}} = recipient name, {{date}} = send date, {{assetCount}} = number of assets.

INSERT INTO system_configuration (name, value, description, created_by, updated_by)
VALUES
  (
    'email_template_operator',
    '{"subject":"שליחת נתונים לעירייה - {{date}}","body":"שלום {{name}},\n\nמצורפים קבצי הנתונים שלך ({{assetCount}} נכסים).\n\nתאריך שליחה: {{date}}\n\nבברכה,\nמערכת ניהול נכסים"}'::text,
    'תבנית אימייל למפעיל. משתנים דינמיים: {{name}} {{date}} {{assetCount}}',
    'migration',
    'migration'
  ),
  (
    'email_template_manager',
    '{"subject":"שליחת נתונים לעירייה - {{date}}","body":"שלום {{name}},\n\nמצורפים רשימת הנכסים לפי אזורי המס שלך שנשלחו לעירייה ({{assetCount}} נכסים).\n\nתאריך שליחה: {{date}}\n\nבברכה,\nמערכת ניהול נכסים"}'::text,
    'תבנית אימייל למנהל. משתנים דינמיים: {{name}} {{date}} {{assetCount}}',
    'migration',
    'migration'
  )
ON CONFLICT (name) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
