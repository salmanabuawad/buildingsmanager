-- Set email for inspector user(s): salman.abuawad@gmail.com
-- Run this to ensure the inspector receives task-assignment and return-to-inspector notifications.

UPDATE users
SET user_email = 'salman.abuawad@gmail.com',
    updated_at = now()
WHERE user_role = 'inspector';
