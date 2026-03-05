# ref_only ↔ Main Codebase Sync Summary

**Date:** 2025-02-28

## Full System Sync (Supabase → Python)

**Supabase** is the source of truth. The **Python backend does not use Supabase** at runtime—it connects to Postgres via `DATABASE_URL`. See **`docs/SYNC_FULL_SYSTEM.md`** for the complete sync workflow (schema + reference data).

---

## Supabase MCP – DB and Code Sync Workflow

**Supabase is the source of truth** for schema and reference data. Use MCP to keep local DB and code in sync.

### 1. field_configurations

```powershell
# 1. Export from Supabase (via MCP execute_sql):
#    SELECT grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order
#    FROM field_configurations ORDER BY grid_name, column_order NULLS LAST, field_name

# 2. Save MCP output to a file, then sync to local:
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/buildingsmanager"
python scripts/sync_field_configs_to_local.py --mcp-output path/to/mcp_output.txt
```

### 2. Schema Verification

| Tool | Purpose |
|------|---------|
| `list_tables` | See full schema (columns, types, constraints) |
| `list_migrations` | See applied Supabase migrations |
| `execute_sql` | Run queries (e.g. check columns) |

**Key schema (Supabase):**

- `assets.business_distribution_area` (not area_from_distribution)
- `inspection_tasks.priority` (high, medium, low)
- `inspection_tasks.status`: new, in_progress, pending_approval, approved, cancelled
- `users.full_name`, `inspection_report_files.asset_id`

### 3. Local Migrations (align with Supabase)

- `20260308000000_rename_area_from_distribution_to_business_distribution_area.sql` – assets
- `20260309000000_add_inspection_tasks_priority.sql` – inspection_tasks.priority

Apply with `standalone/apply_migrations.ps1` (requires psql) or your DB tool.

---

## Completed Syncs

### 1. Help System (F1 contextual help) ✅
- **Added:** `src/lib/helpContent.ts` – Hebrew help content for all screens
- **Added:** `src/contexts/HelpContext.tsx` – Context for help state
- **Added:** `src/components/HelpModal.tsx` – Modal displaying contextual help
- **Updated:** `src/main.tsx` – Wrapped app with `HelpProvider`
- **Updated:** `src/App.tsx` – F1 key handler, Help button in sidebar, `setContextFromTabType` on tab change

**Usage:** Press F1 or click the Help icon (?) in the sidebar to open contextual help for the current screen.

### 2. Inspector Task Email Notifications + Access Tokens ✅
- **Migration:** `20260307000000_inspection_task_access_tokens.sql` – one-time login tokens table
- **Migration:** `20260307000001_seed_email_template_inspection_task.sql` – email template
- **Backend:** `POST /api/inspection-tasks/{task_id}/access-token` – create token (admin only)
- **Backend:** `POST /api/auth/session-by-task-token` – login without password
- **Added:** `src/lib/inspectionTaskNotifications.ts` – notifyTaskAssigned / notifyTaskReturned
- **Added:** `api.users.getOne(userId)`, `getEmailTemplate('email_template_inspection_task')`
- **Added:** `loginByTaskToken` in usersTableAuth, token handling in App.tsx on load
- **Updated:** InspectionTasksManager – notify on create (when assigned) and on return

**Usage:** Create a task with an assigned inspector → email sent with one-time link. Return a task → email sent. Inspector clicks link → logged in automatically, opened to tasks view.

### 3. UI Adaptations from ref_only ✅
- **Sidebar header:** User role badge (מנהל / פקח / משתמש)
- **Inspector-only sidebar:** Inspectors see only "משימות ביקורת" button; Buildings/Assets/Admin hidden
- **Default tabs:** Non-inspector: dashboard, inspection-tasks, buildings; Inspector: inspection-tasks only
- **Manager actions submenu:** "פעולות מנהל" with משימות ביקורת, איפוס שליחת נתונים
- **System config submenu:** "הגדרות מערכת" expandable with הגדרות כלליות, סוגי נכסים, רשימת כתובות, הגדרות שדות, מפעילים, מנהלים, ניהול משתמשים
- **Token login redirect:** `#inspection-tasks` or `#inspection-tasks/{taskId}` (deep link)
- **ClipboardList icon** for inspection tasks (replacing ListTodo)
- **Help button** + footer "Kortex Digital"

---

## Supabase DB (MCP) vs Local Migrations

### Tables in Supabase (source of truth) that may differ from local

| Table / Feature | Supabase | Local migrations |
|-----------------|----------|------------------|
| `inspection_task_access_tokens` | ✅ Exists | ✅ `20260307000000` |
| `inspection_tasks.priority` | ✅ (high/medium/low) | ❌ Uses different status flow |
| `users.full_name` | ✅ | Check migration |
| `inspection_tasks` status values | new, in_progress, pending_approval, approved, cancelled | open, in_inspector_handling, etc. |
| `inspection_report_files.asset_id` | ✅ Optional FK to assets | ❌ May be missing |

**Recommendation:** Use Supabase MCP `list_tables` and `execute_sql` to inspect actual schema before adding migrations. Apply new migrations via MCP `apply_migration` when adding features.

---

## ref_only Features Not Yet Ported

### 1. ref_only uses Supabase client; main uses FastAPI REST
- ref_only: `api.ts`, `supabase.ts`, `db.ts` – direct Supabase
- main: `apiClient.ts`, `restClient.ts`, `api.ts` (wraps REST) – FastAPI backend
- No direct port of ref_only `api` – main already has equivalent REST-based `api`

### 2. Priority field on inspection_tasks ✅
- Supabase has `priority` (high/medium/low)
- Migration `20260309000000_add_inspection_tasks_priority.sql` adds it locally
- Backend and frontend support priority in list/create/update
- Field config for inspection-tasks includes priority (עדיפות)

---

## Quick Reference: Supabase MCP Tools

| Tool | Purpose |
|------|---------|
| `list_tables` | See schema (columns, types, constraints) |
| `list_migrations` | See applied migrations |
| `execute_sql` | Run queries (e.g. check columns, functions) |
| `apply_migration` | Apply new migration (name + SQL) |

---

## Files Compared

| ref_only | main | Status |
|----------|------|--------|
| HelpModal, HelpContext, helpContent | — | ✅ Ported |
| inspectionTaskNotifications | — | ✅ Ported |
| InspectionTasks (Supabase) | InspectionTasksManager (REST) | Main has evolved version |
| MobileTasksAndUpload | — | Main has it; ref doesn’t |
| api.ts (Supabase) | api.ts + apiClient + restClient | Main uses REST |
