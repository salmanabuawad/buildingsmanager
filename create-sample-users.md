# משתמשי דוגמה (Sample Users)

## איך ליצור משתמשי דוגמה

כדי ליצור משתמשים במערכת, השתמש במסך ההרשמה באפליקציה:

### משתמש צופה (Viewer - Read Only)
```
Email: viewer@example.com
Password: viewer123
Role: viewer (ברירת מחדל)
```

משתמש זה יכול:
- ✓ לצפות בכל הבניינים
- ✓ לצפות בכל הנכסים
- ✓ לצפות בפרטי דירות
- ✓ לצפות בהיסטוריית מדידות
- ✗ לא יכול לערוך שום דבר

### משתמש עורך (Editor - Read & Write)
```
Email: editor@example.com
Password: editor123
Role: צריך לשנות ידנית ל-editor
```

משתמש זה יכול:
- ✓ לצפות בכל הבניינים
- ✓ לצפות בכל הנכסים
- ✓ לערוך פרטי דירות
- ✓ להוסיף מדידות
- ✓ לערוך ולמחוק מדידות
- ✓ להעלות קבצי DWG/PDF

## איך לשנות משתמש ל-Editor

לאחר יצירת משתמש, תוכל לשנות את התפקיד שלו באמצעות SQL:

```sql
-- למצוא את ה-ID של המשתמש
SELECT id, email, role FROM user_profiles;

-- לעדכן משתמש ל-editor
UPDATE user_profiles
SET role = 'editor'
WHERE email = 'editor@example.com';
```

## יצירה אוטומטית של משתמשים (למפתחים)

אם אתה רוצה ליצור משתמשים באופן אוטומטי, אתה יכול להשתמש בקוד הבא:

```javascript
import { supabase } from './src/lib/supabase';

// יצירת משתמש viewer
await supabase.auth.signUp({
  email: 'viewer@example.com',
  password: 'viewer123',
});

// יצירת משתמש editor
const { data } = await supabase.auth.signUp({
  email: 'editor@example.com',
  password: 'editor123',
});

// עדכון ל-editor
if (data.user) {
  await supabase
    .from('user_profiles')
    .update({ role: 'editor' })
    .eq('id', data.user.id);
}
```

## הערות חשובות

1. כל המשתמשים החדשים מתחילים כ-**viewer** (ברירת מחדל)
2. רק אדמין יכול לשנות משתמש ל-**editor** דרך SQL
3. אין צורך באימות אימייל (Email confirmation מושבת)
4. הסיסמה חייבת להיות לפחות 6 תווים
