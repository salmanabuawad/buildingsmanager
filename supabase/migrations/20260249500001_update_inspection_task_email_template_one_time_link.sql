-- Update inspection task email template to mention one-time link (no login required)

UPDATE system_configuration
SET value = '{"subject":"משימת ביקורת: {{taskTitle}}","body":"שלום {{inspectorName}},\n\nמשימת ביקורת {{action}}.\n\nכותרת: {{taskTitle}}\nמזהה משימה: #{{taskId}}\n\nלפתיחת המשימה (ללא צורך בהתחברות): {{taskLink}}\n\nהקישור הוא חד-פעמי ותקף ל־7 ימים.\n\nבברכה,\nמערכת ניהול נכסים"}'
WHERE name = 'email_template_inspection_task';
