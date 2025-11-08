/*
  # הסרת מערכת הרשאות משתמשים (Remove User Permissions System)

  1. שינויים (Changes)
    - הסרת כל מדיניות RLS המבוססות על תפקידי משתמשים
    - הסרת פונקציית get_user_role
    - הסרת טבלת user_profiles
    - החזרת גישה פתוחה לכל הטבלאות (ללא אימות)

  2. אבטחה (Security)
    - הפיכת כל הטבלאות לנגישות ציבורית ללא אימות
    - הסרת כל דרישות אימות
*/

-- הסרת מדיניות RLS מ-buildings
DROP POLICY IF EXISTS "Authenticated users can view buildings" ON buildings;
DROP POLICY IF EXISTS "Editors can insert buildings" ON buildings;
DROP POLICY IF EXISTS "Editors can update buildings" ON buildings;
DROP POLICY IF EXISTS "Editors can delete buildings" ON buildings;

-- הסרת מדיניות RLS מ-apartments
DROP POLICY IF EXISTS "Authenticated users can view apartments" ON apartments;
DROP POLICY IF EXISTS "Editors can insert apartments" ON apartments;
DROP POLICY IF EXISTS "Editors can update apartments" ON apartments;
DROP POLICY IF EXISTS "Editors can delete apartments" ON apartments;

-- הסרת מדיניות RLS מ-apartment_measurements
DROP POLICY IF EXISTS "Authenticated users can view measurements" ON apartment_measurements;
DROP POLICY IF EXISTS "Editors can insert measurements" ON apartment_measurements;
DROP POLICY IF EXISTS "Editors can update measurements" ON apartment_measurements;
DROP POLICY IF EXISTS "Editors can delete measurements" ON apartment_measurements;

-- הוספת מדיניות גישה ציבורית לכל הטבלאות
CREATE POLICY "Enable all access for everyone" ON buildings FOR ALL USING (true);
CREATE POLICY "Enable all access for everyone" ON apartments FOR ALL USING (true);
CREATE POLICY "Enable all access for everyone" ON apartment_measurements FOR ALL USING (true);

-- הסרת פונקציה לבדיקת תפקיד משתמש
DROP FUNCTION IF EXISTS get_user_role();

-- הסרת מדיניות RLS מ-user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can create own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- הסרת טבלת user_profiles
DROP TABLE IF EXISTS user_profiles;