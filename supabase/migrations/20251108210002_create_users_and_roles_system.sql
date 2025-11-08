/*
  # מערכת הרשאות משתמשים (User Roles & Permissions System)

  1. טבלאות חדשות (New Tables)
    - `user_profiles`
      - `id` (uuid, primary key) - מזהה המשתמש
      - `email` (text) - אימייל המשתמש
      - `role` (text) - תפקיד: 'viewer' (צפייה בלבד) או 'editor' (קריאה וכתיבה)
      - `created_at` (timestamp) - תאריך יצירה

  2. שינויים בטבלאות קיימות (Changes to Existing Tables)
    - עדכון מדיניות RLS לכל הטבלאות (buildings, apartments, apartment_measurements)
    - הוספת מדיניות המבוססת על תפקיד המשתמש

  3. אבטחה (Security)
    - הפעלת RLS על טבלת user_profiles
    - מדיניות SELECT - כל משתמש מחובר יכול לראות את הפרופיל שלו
    - מדיניות INSERT - רק במהלך רישום
    - מדיניות UPDATE - רק משתמש יכול לעדכן את הפרופיל שלו
    
  4. הערות חשובות (Important Notes)
    - משתמשי 'viewer' יכולים רק לקרוא נתונים
    - משתמשי 'editor' יכולים לקרוא ולכתוב נתונים
    - ברירת מחדל לכל משתמש חדש היא 'viewer'
*/

-- יצירת טבלת פרופילי משתמשים
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  created_at timestamptz DEFAULT now()
);

-- הפעלת RLS על טבלת user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- מדיניות לצפייה בפרופיל עצמי
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- מדיניות ליצירת פרופיל (בזמן רישום)
CREATE POLICY "Users can create own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- מדיניות לעדכון פרופיל עצמי (רק מנהלים יכולים לשנות role)
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- פונקציה לבדיקת תפקיד משתמש
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- עדכון מדיניות RLS עבור טבלת buildings
DROP POLICY IF EXISTS "Enable read access for all users" ON buildings;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON buildings;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON buildings;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON buildings;

-- כל המשתמשים המחוברים יכולים לקרוא
CREATE POLICY "Authenticated users can view buildings"
  ON buildings FOR SELECT
  TO authenticated
  USING (true);

-- רק editors יכולים להוסיף
CREATE POLICY "Editors can insert buildings"
  ON buildings FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'editor');

-- רק editors יכולים לעדכן
CREATE POLICY "Editors can update buildings"
  ON buildings FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'editor')
  WITH CHECK (get_user_role() = 'editor');

-- רק editors יכולים למחוק
CREATE POLICY "Editors can delete buildings"
  ON buildings FOR DELETE
  TO authenticated
  USING (get_user_role() = 'editor');

-- עדכון מדיניות RLS עבור טבלת apartments
DROP POLICY IF EXISTS "Enable read access for all users" ON apartments;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON apartments;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON apartments;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON apartments;

-- כל המשתמשים המחוברים יכולים לקרוא
CREATE POLICY "Authenticated users can view apartments"
  ON apartments FOR SELECT
  TO authenticated
  USING (true);

-- רק editors יכולים להוסיף
CREATE POLICY "Editors can insert apartments"
  ON apartments FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'editor');

-- רק editors יכולים לעדכן
CREATE POLICY "Editors can update apartments"
  ON apartments FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'editor')
  WITH CHECK (get_user_role() = 'editor');

-- רק editors יכולים למחוק
CREATE POLICY "Editors can delete apartments"
  ON apartments FOR DELETE
  TO authenticated
  USING (get_user_role() = 'editor');

-- עדכון מדיניות RLS עבור טבלת apartment_measurements
DROP POLICY IF EXISTS "Enable read access for all users" ON apartment_measurements;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON apartment_measurements;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON apartment_measurements;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON apartment_measurements;

-- כל המשתמשים המחוברים יכולים לקרוא
CREATE POLICY "Authenticated users can view measurements"
  ON apartment_measurements FOR SELECT
  TO authenticated
  USING (true);

-- רק editors יכולים להוסיף
CREATE POLICY "Editors can insert measurements"
  ON apartment_measurements FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'editor');

-- רק editors יכולים לעדכן
CREATE POLICY "Editors can update measurements"
  ON apartment_measurements FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'editor')
  WITH CHECK (get_user_role() = 'editor');

-- רק editors יכולים למחוק
CREATE POLICY "Editors can delete measurements"
  ON apartment_measurements FOR DELETE
  TO authenticated
  USING (get_user_role() = 'editor');