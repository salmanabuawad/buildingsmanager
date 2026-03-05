# תכנון: משימות ביקורת והפצה לפקחי שטח

## 5. סקירה כללית

- **ניהול משימות (מנהל – Admin)** – מנהל יוצר משימות ביקורת, מקצה אותן לפקחים, צופה בכל המשימות (פילטר לפי סטטוס/פקח), מאשר דיווחים ומעביר לאוטומציה או מחזיר לפקח. ממשק ניהול משימות זמין רק ל־admin.
- **קבלת משימות** – מנהל/מערכת יוצרת משימות ביקורת (לבניין, נכס או רשימת נכסים).
- **הפצה לפקחים** – כל משימה מוקצית לפקח שטח (משתמש עם תפקיד `inspector`).
- **ביצוע ביקורת** – הפקח ממלא דיווח ביקורת ומצרף תמונות.
- **אישור והעברה** – מנהל מאשר ומעביר לאוטומציה.

---

## 6. סטטוסים (Status) – מחזור חיים

| קוד (DB) | עברית | תיאור |
|----------|--------|--------|
| `new` | חדש | מנהל יצר משימה והקצה לפקח; טרם נלקחה |
| `in_progress` | בטיפול | פקח לקח את המשימה, מבצע ביקורת / ממלא דיווח |
| `pending_approval` | ממתין לאישור | הפקח הגיש לאישור מנהל |
| `approved` | אושר | מנהל אישר – סטטוס סופי |
| `cancelled` | בוטל | מנהל ביטל – סטטוס סופי |

**זרימת סטטוסים:**

```
new → in_progress → pending_approval → approved
  |         ↑_______________|
  |         (מנהל מחזיר לפקח עם הערה + תאריך/שעה)
  └→ cancelled (מנהל יכול לבטל בכל שלב עד אישור)
```

**היסטוריה והערות:** כל מעבר (נלקחה, הוגש, הוחזר, אושר, בוטל) נרשם ב־`inspection_task_history` עם תאריך/שעה אוטומטיים; בהחזרה לפקח ניתן להוסיף הערה (comment).

---

## 7. מודל נתונים (הצעה)

### 7.1 טבלה: `inspection_tasks` (משימות ביקורת)

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | bigserial PK | מזהה משימה |
| `title` | text | כותרת משימה (אופציונלי) |
| `building_id` | int FK → buildings.id | בניין לביקורת |
| `asset_ids` | bigint[] | נכסים ספציפיים (ריק = כל הבניין) |
| `assigned_to` | int FK → users.user_id | פקח מוקצה (משתמש עם role=inspector) |
| `status` | text | אחד: open, in_inspector_handling, pending_manager_approval, closed |
| `created_at` | timestamptz | מועד יצירה |
| `created_by` | int FK → users.user_id | יוצר המשימה (מנהל) |
| `updated_at` | timestamptz | עדכון אחרון |
| `taken_at` | timestamptz | מתי הפקח לקח למשימה |
| `submitted_at` | timestamptz | מתי נשלח לאישור מנהל |
| `approved_at` | timestamptz | מתי מנהל אישר והעביר לאוטמציה |
| `approved_by` | int FK → users.user_id | מנהל שאישר |
| `note` | text | הערה כללית למשימה |

- **Constraint:** `status` IN ('open', 'in_inspector_handling', 'pending_manager_approval', 'closed').
- **Index:** על `assigned_to`, `status`, `building_id`, `created_at`.

### 7.2 טבלה: `inspection_reports` (דיווח ביקורת)

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | bigserial PK | מזהה דיווח |
| `task_id` | bigint FK → inspection_tasks.id | משימה אחת = דיווח אחד (1:1) |
| `report_text` | text | תוכן הדיווח (טקסט חופשי או שדות מובנים) |
| `reported_at` | timestamptz | מועד מילוי הדיווח |
| `reported_by` | int FK → users.user_id | הפקח שמילא |
| `created_at` / `updated_at` | timestamptz | |

- אפשר להרחיב: שדות מובנים (ממצאים, המלצות, דירוג וכו').

### 7.3 טבלה: `inspection_report_files` (תמונות/קבצים מצורפים לדיווח)

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | bigserial PK | |
| `report_id` | bigint FK → inspection_reports.id | שיוך לדיווח |
| `file_path` | text | נתיב storage (כמו asset_files) |
| `file_name` | text | שם קובץ לתצוגה |
| `file_type` | text | MIME / סיומת |
| `uploaded_at` | timestamptz | |
| `uploaded_by` | int FK → users.user_id | |

- **אחסון:** אותו מנגנון כמו `asset_files` – תיקייה ייעודית תחת ה-storage הקיים, למשל `inspections/{task_id}/{report_id}/` או `inspections/{report_id}/`.

---

## 8. תפקידים והרשאות

| פעולה | admin | inspector | user |
|--------|--------|-----------|------|
| צפייה במשימות | כל המשימות | רק משימות שמוקצות אליי | לא (או רק צפייה מוגבלת) |
| יצירת משימה | ✓ | לא | לא |
| הקצאת משימה לפקח | ✓ | לא | לא |
| "לקחת משימה" (פתוח → בטיפול פקח) | ✓ | ✓ (רק משימות שמוקצות אליי) | לא |
| מילוי דיווח + צירוף תמונות | ✓ | ✓ (רק במשימות שלו) | לא |
| שליחה לאישור (בטיפול → ממתין לאישור) | ✓ | ✓ | לא |
| אישור והעברה לאוטמציה | ✓ | לא | לא |
| החזרה לפקח | ✓ | לא | לא |

---

## 9. API (הצעה)

- **משימות**
  - `GET /api/inspection-tasks` – רשימת משימות (פילטרים: status, assigned_to, building_id).
  - `POST /api/inspection-tasks` – יצירת משימה (admin).
  - `GET /api/inspection-tasks/:id` – פרטי משימה + דיווח + קבצים.
  - `PATCH /api/inspection-tasks/:id` – עדכון (הקצאה, סטטוס, וכו').
  - `POST /api/inspection-tasks/:id/take` – פקח לוקח משימה (open → in_inspector_handling).
  - `POST /api/inspection-tasks/:id/submit` – שליחה לאישור (in_inspector_handling → pending_manager_approval).
  - `POST /api/inspection-tasks/:id/approve` – מנהל מאשר (pending_manager_approval → closed).
  - `POST /api/inspection-tasks/:id/return` – מנהל מחזיר לפקח (→ in_inspector_handling).

- **דיווח**
  - `GET /api/inspection-reports?task_id=:id` – דיווח למשימה (בדרך כלל משימה אחת = דיווח אחד).
  - `PUT /api/inspection-reports` – יצירה/עדכון דיווח (report_text וכו').

- **קבצים**
  - `POST /api/inspection-reports/:reportId/files` – העלאת תמונה/קובץ (כמו upload ל-asset_files).
  - `GET /api/inspection-reports/:reportId/files` – רשימת קבצים.
  - `DELETE /api/inspection-reports/files/:fileId` – מחיקת קובץ.

---

## 10. ממשק משתמש (UI) – כיוונים

1. **ניהול משימות ביקורת (Admin only)**
   - **מיקום:** פריט תפריט/טאב ייעודי למנהלים בלבד (למשל "ניהול משימות ביקורת" או "משימות ביקורת").
   - **מסך משימות ביקורת (מנהל)**
   - טבלה/כרטיסים: משימה, בניין, פקח מוקצה, סטטוס, תאריכים.
   - פילטרים: סטטוס, פקח.
   - יצירת משימה: בחירת בניין (ואופציונלי נכסים), בחירת פקח, שמירה.
   - עריכת משימה: שינוי הקצאה, סטטוס (בהתאם לזרימה).
   - צפייה בדיווח ובתמונות, אישור/העברה לאוטומציה או החזרה לפקח.

2. **מסך "המשימות שלי" (פקח)**
   - רשימת משימות שמוקצות לפקח, עם סטטוס.
   - כפתור "לקחת משימה" למשימות בסטטוס פתוח.
   - כניסה למשימה → טופס דיווח ביקורת + העלאת תמונות.
   - כפתור "שליחה לאישור מנהל" כשהדיווח מוכן.

3. **מסך אישור (מנהל)**
   - משימות בסטטוס "ממתין לאישור מנהל".
   - צפייה בדיווח ובתמונות, כפתור "אישור והעברה לאוטמציה" או "החזר לפקח".

4. **אינטגרציה**
   - קישור לבניין/נכס מהמערכת הקיימת (buildings, assets).
   - שימוש ב-storage ובמנגנון הקבצים הקיים (כמו ב-asset_files) לתמונות הדיווח.

---

## 11. מיגרציה והרצה

- קובץ מיגרציה SQL: יצירת הטבלאות `inspection_tasks`, `inspection_reports`, `inspection_report_files` עם ה-FK, ה-CHECK על `status`, וה-indexים.
- הוספת הטבלאות ל-`ALLOWED_TABLES` ב-data router (אם משתמשים ב-generic CRUD), או בניית router ייעודי `/api/inspection-tasks` ו־`/api/inspection-reports` עם לוגיקת סטטוס והרשאות.

---

## 12. סיכום

- **משימות** עם סטטוסים: פתוח → בטיפול פקח → ממתין לאישור מנהל → סגור.
- **פקח** מבצע ביקורת, ממלא דיווח ב־`inspection_reports`, ומצרף תמונות ב־`inspection_report_files`.
- **מנהל (Admin)** מנהל את כל המשימות: יצירה, הקצאה לפקחים, צפייה ברשימה (עם פילטרים), אישור דיווחים והעברה לאוטומציה או החזרה לפקח. ממשק ניהול משימות זמין רק ל־admin.
- אחסון תמונות באותו מנגנון קבצים קיים (storage path ייעודי למשימות ביקורת).

אם תרצה, אפשר בשלב הבא לפרט את קובץ המיגרציה SQL המלא או את חתימות ה-API בפועל (כולל request/response).
