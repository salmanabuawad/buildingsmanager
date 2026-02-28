-- Seed email template for inspection task notifications (assigned / returned to inspector)
-- Placeholders: {{inspectorName}}, {{taskTitle}}, {{taskId}}, {{taskLink}}, {{action}} (הוקצתה אליך / הוחזרה אליך לתיקון)

INSERT INTO system_configuration (name, value, description, created_by, updated_by)
VALUES (
  'email_template_inspection_task',
  '{"subject":"משימת ביקורת: {{taskTitle}}","body":"שלום {{inspectorName}},\n\nמשימת ביקורת {{action}}.\n\nכותרת: {{taskTitle}}\nמזהה משימה: #{{taskId}}\n\nלפתיחת המשימה ישירות: {{taskLink}}\n\nבברכה,\nמערכת ניהול נכסים"}'::text,
  'תבנית אימייל להקצאת משימה / החזרה לפקח. משתנים: {{inspectorName}} {{taskTitle}} {{taskId}} {{taskLink}} {{action}}',
  'migration',
  'migration'
)
ON CONFLICT (name) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
