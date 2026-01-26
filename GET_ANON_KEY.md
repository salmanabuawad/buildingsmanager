# איך למצוא את ה-ANON_KEY הנכון

## שלבים:

1. **פתח את Supabase Dashboard:**
   - לך ל: https://supabase.com/dashboard
   - התחבר לחשבון שלך

2. **בחר את הפרויקט:**
   - בחר את הפרויקט `bolt-native-database-59857294`
   - (או את הפרויקט שלך אם השם שונה)

3. **לך להגדרות API:**
   - בתפריט השמאלי, לחץ על **Settings** (⚙️)
   - לחץ על **API** בתת-תפריט

4. **העתק את ה-ANON_KEY:**
   - תחת **Project API keys**
   - מצא את ה-**`anon` `public`** key
   - לחץ על העתק (Copy) או העתק את הערך

5. **עדכן את הקבצים:**
   
   **א. קובץ `.env.local` (לפיתוח מקומי):**
   ```env
   VITE_SUPABASE_URL=https://bolt-native-database-59857294.supabase.co
   VITE_SUPABASE_ANON_KEY=הדבק_כאן_את_ה-ANON_KEY_שהעתקת
   ```

   **ב. קובץ `netlify.toml` (לפרודקשן):**
   ```toml
   VITE_SUPABASE_ANON_KEY = "הדבק_כאן_את_ה-ANON_KEY_שהעתקת"
   ```

   **ג. קובץ `data_for_test/.env.test` (לבדיקות):**
   ```env
   VITE_SUPABASE_ANON_KEY=הדבק_כאן_את_ה-ANON_KEY_שהעתקת
   ```

## ⚠️ חשוב:

- **אל תשתף** את ה-ANON_KEY בפומבי (GitHub, פורומים, וכו')
- ה-ANON_KEY הוא public, אבל עדיין לא מומלץ לחשוף אותו
- אם ה-ANON_KEY נחשף, תוכל ליצור אחד חדש ב-Settings > API > Reset

## 🔍 איך לזהות את ה-ANON_KEY הנכון:

ה-ANON_KEY נראה כך:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkc3h1aW9lc2Zxdnp1dndsaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzI1NjUsImV4cCI6MjA3ODEwODU2NX0.xxxxx
```

- זה JWT token ארוך
- מתחיל ב-`eyJ`
- מכיל נקודות (`.`) שמפרידות בין חלקים
- ה-`ref` בתוכו צריך להתאים ל-`bolt-native-database-59857294`

## ✅ אחרי העדכון:

1. שמור את הקבצים
2. רענן את האפליקציה (או הפעל מחדש את שרת הפיתוח)
3. בדוק שהשגיאה "Invalid API key" נעלמה
