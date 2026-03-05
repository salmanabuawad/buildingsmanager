-- Seed email template for inspection task notifications (assigned/returned).
-- Placeholders: {{inspectorName}}, {{taskTitle}}, {{taskId}}, {{taskLink}}, {{action}}

INSERT INTO system_configuration (name, value, description, created_by, updated_by)
VALUES
  (
    'email_template_inspection_task',
    '{"subject":"משימת ביקורת {{action}}: {{taskTitle}}","body":"שלום {{inspectorName}},\n\nמשימת ביקורת {{action}}.\nכותרת: {{taskTitle}}\nמזהה משימה: #{{taskId}}\n\nלפתיחת המשימה ישירות (ללא צורך בהתחברות): {{taskLink}}\n\nהקישור הוא חד-פעמי ותקף ל־7 ימים.\n\nבברכה,\nמערכת ניהול נכסים"}'::text,
    'תבנית אימייל למשימות ביקורת (הקצאה/החזרה). משתנים: {{inspectorName}} {{taskTitle}} {{taskId}} {{taskLink}} {{action}}',
    'migration',
    'migration'
  )
ON CONFLICT (name) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
