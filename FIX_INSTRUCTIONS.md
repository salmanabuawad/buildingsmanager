# הוראות תיקון - Asset Files & Storage RLS

## ✅ מה תוקן:

1. **עודכן ה-URL של Supabase** ל-`bolt-native-database-59857294.supabase.co` בקבצים:
   - `netlify.toml`
   - `README.md`
   - `data_for_test/.env.test`

## 🔧 מה צריך לעשות עכשיו:

### שלב 1: עדכן את ה-ANON_KEY

1. פתח את [Supabase Dashboard](https://supabase.com/dashboard)
2. בחר את הפרויקט `bolt-native-database-59857294`
3. לך ל-Settings > API
4. העתק את ה-`anon` key
5. עדכן את הקבצים הבאים:
   - `netlify.toml` - עדכן את `VITE_SUPABASE_ANON_KEY`
   - `data_for_test/.env.test` - עדכן את `VITE_SUPABASE_ANON_KEY`
   - אם יש קובץ `.env.local` - עדכן גם שם

### שלב 2: הרץ את הסקריפט SQL

1. פתח את Supabase Dashboard > SQL Editor
2. העתק את התוכן של `create_asset_files_table_and_fix_rls.sql`
3. הרץ את הסקריפט

זה ייצור:
- את טבלת `asset_files`
- את מדיניות ה-RLS של הטבלה
- את מדיניות ה-RLS של Storage (אם זה יעבוד)

### שלב 3: צור מדיניות Storage דרך Dashboard

אם שלב 2 לא יצר את מדיניות ה-Storage (בגלל שגיאת הרשאות), צור אותן ידנית:

1. לך ל-Storage > Policies
2. בחר את ה-bucket `structure-drawings`
3. לחץ על "New Policy"
4. צור 4 מדיניויות:

#### מדיניות 1: SELECT (קריאה)
- **Policy name**: `Allow anonymous and authenticated users to read from structure-drawings`
- **Allowed operation**: `SELECT`
- **Target roles**: `anon, authenticated`
- **USING expression**: `bucket_id = 'structure-drawings'`

#### מדיניות 2: INSERT (העלאה)
- **Policy name**: `Allow anonymous and authenticated users to upload to structure-drawings`
- **Allowed operation**: `INSERT`
- **Target roles**: `anon, authenticated`
- **WITH CHECK expression**: `bucket_id = 'structure-drawings'`

#### מדיניות 3: UPDATE (עדכון)
- **Policy name**: `Allow anonymous and authenticated users to update structure-drawings`
- **Allowed operation**: `UPDATE`
- **Target roles**: `anon, authenticated`
- **USING expression**: `bucket_id = 'structure-drawings'`
- **WITH CHECK expression**: `bucket_id = 'structure-drawings'`

#### מדיניות 4: DELETE (מחיקה)
- **Policy name**: `Allow anonymous and authenticated users to delete from structure-drawings`
- **Allowed operation**: `DELETE`
- **Target roles**: `anon, authenticated`
- **USING expression**: `bucket_id = 'structure-drawings'`

### שלב 4: בדוק שהכל עובד

1. רענן את האפליקציה
2. נסה להעלות קובץ
3. ודא שאין שגיאות ב-console

## 📝 הערות:

- אם יש לך קובץ `.env.local`, ודא שהוא מכיל את ה-URL וה-ANON_KEY הנכונים
- אם אתה מריץ את האפליקציה מקומית, ודא ש-`VITE_USE_LOCAL_DB=false` או שהגדרת את ה-URL הנכון

## 🆘 אם עדיין יש בעיות:

1. בדוק ב-console של הדפדפן מה השגיאה המדויקת
2. ודא שהטבלה `asset_files` קיימת: `SELECT * FROM asset_files LIMIT 1;`
3. בדוק את המדיניות: `SELECT * FROM pg_policies WHERE tablename = 'asset_files';`
4. בדוק את מדיניות ה-Storage: `SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';`
