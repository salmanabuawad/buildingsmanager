-- ============================================================================
-- Buildings Manager - Complete PostgreSQL Schema
-- Self-hosted (no Supabase RLS, no auth schema, no triggers/functions)
-- All business logic handled by FastAPI Python services
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'manual_update',
    'import_file',
    'transfer_area',
    'distribute_shared',
    'business_distribution',
    'residence_distribution'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 1. ADDRESS LIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS address_list (
  id          BIGSERIAL PRIMARY KEY,
  street_code INTEGER UNIQUE CHECK (street_code >= 0 AND street_code <= 9999),
  street_description TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_address_list_street_code        ON address_list(street_code);
CREATE INDEX IF NOT EXISTS idx_address_list_street_description ON address_list(street_description);

-- ============================================================================
-- 2. ASSET TYPES
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_types (
  id                              SERIAL PRIMARY KEY,
  name                            TEXT NOT NULL,
  description                     TEXT,
  tax_region                      INTEGER,
  elevator                        TEXT,
  single_double_family            TEXT,
  penthouse                       TEXT,
  condo                           TEXT,
  townhouses                      TEXT,
  business_private                TEXT,
  business_residence              TEXT,
  min_size                        NUMERIC,
  max_size                        NUMERIC,
  active                          TEXT DEFAULT 'כן',
  non_accountable_for_total_area  BOOLEAN DEFAULT false,
  non_accountable_for_distribution BOOLEAN DEFAULT false,
  not_accountable_for_statistics  BOOLEAN DEFAULT false,
  use_shared_area                 BOOLEAN DEFAULT NULL,
  shared_area_usage               TEXT,
  area_description_for_tab        TEXT,
  created_at                      TIMESTAMPTZ DEFAULT now(),
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_types_name       ON asset_types(name);
CREATE INDEX IF NOT EXISTS idx_asset_types_tax_region ON asset_types(tax_region);
CREATE INDEX IF NOT EXISTS idx_asset_types_active     ON asset_types(active);

-- ============================================================================
-- 3. VALIDATION RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_rules (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_key            TEXT UNIQUE NOT NULL,
  rule_type           TEXT NOT NULL,
  field_name          TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  value_numeric       INTEGER,
  value_text          TEXT,
  enabled             BOOLEAN DEFAULT true,
  error_message       TEXT,
  description         TEXT,
  compare_table       TEXT,
  compare_field       TEXT,
  join_field          TEXT,
  comparison_operator TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_field_name  ON validation_rules(field_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_enabled     ON validation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_key    ON validation_rules(rule_key);

-- ============================================================================
-- 4. BUILDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS buildings (
  building_number          BIGINT PRIMARY KEY,
  total_building_area      NUMERIC(10,2) DEFAULT 0,
  tax_region               TEXT,
  elevator                 TEXT,
  single_double_family     TEXT,
  condo                    TEXT,
  townhouses               TEXT,
  residence_shared_area    NUMERIC(10,2) DEFAULT 0,
  business_shared_area     NUMERIC(10,2),
  area_for_control         NUMERIC,
  building_number_in_street BIGINT,
  gosh                     BIGINT,
  helka                    BIGINT,
  overload_ratio           NUMERIC(5,2),
  need_residence_distribution BOOLEAN DEFAULT false,
  need_business_distribution  BOOLEAN DEFAULT false,
  action_id                BIGINT,
  building_address         TEXT,
  note                     TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buildings_tax_region     ON buildings(tax_region);
CREATE INDEX IF NOT EXISTS idx_buildings_building_number ON buildings(building_number);

-- ============================================================================
-- 5. ASSETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
  asset_id              BIGINT PRIMARY KEY,
  building_number       BIGINT NOT NULL,
  payer_id              TEXT,
  measurement_date      TEXT NOT NULL DEFAULT '01/01/1900',
  main_asset_type       TEXT,
  asset_size            NUMERIC,
  sub_asset_type_1      TEXT,
  sub_asset_size_1      NUMERIC,
  sub_asset_type_2      TEXT,
  sub_asset_size_2      NUMERIC,
  sub_asset_type_3      TEXT,
  sub_asset_size_3      NUMERIC,
  sub_asset_type_4      TEXT,
  sub_asset_size_4      NUMERIC,
  sub_asset_type_5      TEXT,
  sub_asset_size_5      NUMERIC,
  sub_asset_type_6      TEXT,
  sub_asset_size_6      NUMERIC,
  structure_drawing_url TEXT,
  elevator              TEXT,
  single_double_family  TEXT,
  condo                 TEXT,
  townhouses            TEXT,
  penthouse             TEXT,
  tax_region            INTEGER,
  discount_type         TEXT,
  discount_date_from    TEXT,
  discount_date_to      TEXT,
  is_new_measurement    BOOLEAN DEFAULT false,
  area_from_distribution NUMERIC,
  exported_to_automation BOOLEAN DEFAULT false,
  data_from_automation  BOOLEAN DEFAULT false,
  export_to_automation_at TEXT,
  comment               TEXT,
  apartment_number      TEXT,
  apartment_floor       TEXT,
  storage_number        TEXT,
  storage_floor         TEXT,
  operator_id           BIGINT,
  action_id             BIGINT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (building_number) REFERENCES buildings(building_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_building_number  ON assets(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_payer_id         ON assets(payer_id);
CREATE INDEX IF NOT EXISTS idx_assets_tax_region       ON assets(tax_region);
CREATE INDEX IF NOT EXISTS idx_assets_measurement_date ON assets(measurement_date);
CREATE INDEX IF NOT EXISTS idx_assets_operator_id      ON assets(operator_id);

-- ============================================================================
-- 6. ASSETS HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets_history (
  id                    BIGSERIAL PRIMARY KEY,
  asset_id              BIGINT NOT NULL,
  building_number       BIGINT NOT NULL,
  payer_id              TEXT,
  measurement_date      TEXT NOT NULL,
  main_asset_type       TEXT,
  asset_size            NUMERIC,
  sub_asset_type_1      TEXT, sub_asset_size_1 NUMERIC,
  sub_asset_type_2      TEXT, sub_asset_size_2 NUMERIC,
  sub_asset_type_3      TEXT, sub_asset_size_3 NUMERIC,
  sub_asset_type_4      TEXT, sub_asset_size_4 NUMERIC,
  sub_asset_type_5      TEXT, sub_asset_size_5 NUMERIC,
  sub_asset_type_6      TEXT, sub_asset_size_6 NUMERIC,
  structure_drawing_url TEXT,
  elevator              TEXT,
  single_double_family  TEXT,
  condo                 TEXT,
  townhouses            TEXT,
  penthouse             TEXT,
  tax_region            INTEGER,
  discount_type         TEXT,
  discount_date_from    TEXT,
  discount_date_to      TEXT,
  action_id             BIGINT,
  area_from_distribution NUMERIC,
  exported_to_automation BOOLEAN DEFAULT false,
  export_to_automation_at TEXT,
  comment               TEXT,
  apartment_number      TEXT,
  apartment_floor       TEXT,
  storage_number        TEXT,
  storage_floor         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_history_asset_id        ON assets_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_history_building_number ON assets_history(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_history_action_id       ON assets_history(action_id);
CREATE INDEX IF NOT EXISTS idx_assets_history_created_at      ON assets_history(created_at DESC);

-- ============================================================================
-- 7. FIELD CONFIGURATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS field_configurations (
  id           SERIAL PRIMARY KEY,
  grid_name    TEXT NOT NULL,
  field_name   TEXT NOT NULL,
  width_chars  INTEGER,
  padding      INTEGER,
  hebrew_name  TEXT,
  pinned       BOOLEAN DEFAULT false,
  pin_side     TEXT CHECK (pin_side IN ('left', 'right', NULL)),
  visible      BOOLEAN DEFAULT true,
  column_order INTEGER,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grid_name, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_configurations_grid_name  ON field_configurations(grid_name);
CREATE INDEX IF NOT EXISTS idx_field_configurations_field_name ON field_configurations(field_name);

-- ============================================================================
-- 8. USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id       BIGSERIAL PRIMARY KEY,
  auth_user_id  TEXT UNIQUE,
  user_name     TEXT NOT NULL,
  user_email    TEXT,
  user_role     TEXT DEFAULT 'user' CHECK (user_role IN ('admin', 'user', 'inspector')),
  password_hash TEXT,
  active        BOOLEAN DEFAULT true NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_user_email   ON users(user_email);
CREATE INDEX IF NOT EXISTS idx_users_active       ON users(active);

-- ============================================================================
-- 9. AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit (
  id                       BIGSERIAL PRIMARY KEY,
  user_id                  BIGINT,
  action_type              audit_action_type NOT NULL,
  entity_type              TEXT NOT NULL CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset')),
  entity_id                TEXT,
  before_data              JSONB,
  after_data               JSONB,
  description              TEXT,
  building_number          BIGINT,
  overload_ratio           NUMERIC,
  shared_area_size         NUMERIC,
  tax_region               TEXT,
  distribution_action_type TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id        ON audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type    ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type    ON audit(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id      ON audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_building_number ON audit(building_number);
CREATE INDEX IF NOT EXISTS idx_audit_created_at     ON audit(created_at DESC);

-- ============================================================================
-- 10. CHANGE LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_log (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  operation   TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  before_data JSONB,
  after_data  JSONB,
  user_id     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_log_table_name  ON change_log(table_name);
CREATE INDEX IF NOT EXISTS idx_change_log_record_id   ON change_log(record_id);
CREATE INDEX IF NOT EXISTS idx_change_log_created_at  ON change_log(created_at DESC);

-- ============================================================================
-- 11. SYSTEM CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_configuration (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT,
  updated_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_configuration_name ON system_configuration(name);

-- ============================================================================
-- 12. MAILING LIST (tax_regions_mailing_list renamed, kept as mailing_list)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mailing_list (
  id         BIGSERIAL PRIMARY KEY,
  tax_region TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tax_region, email)
);

CREATE INDEX IF NOT EXISTS idx_mailing_list_tax_region ON mailing_list(tax_region);
CREATE INDEX IF NOT EXISTS idx_mailing_list_email      ON mailing_list(email);

-- ============================================================================
-- 13. OPERATORS
-- ============================================================================

CREATE TABLE IF NOT EXISTS operators (
  operator_id BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  mail        TEXT NOT NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operators_mail ON operators(mail);

-- ============================================================================
-- 14. MANAGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS managers (
  manager_id  BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  tax_regions TEXT NOT NULL DEFAULT '',
  mail        TEXT NOT NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managers_mail ON managers(mail);

-- ============================================================================
-- 15. ASSET FILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_files (
  id               BIGSERIAL PRIMARY KEY,
  asset_id         BIGINT,
  file_url         TEXT,
  file_name        TEXT,
  file_size        BIGINT,
  file_type        TEXT,
  uploaded_at      TIMESTAMPTZ DEFAULT now(),
  uploaded_by      TEXT,
  measurement_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id ON asset_files(asset_id);

-- ============================================================================
-- 16. INSPECTION TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspection_tasks (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  building_number BIGINT NOT NULL REFERENCES buildings(building_number) ON DELETE CASCADE,
  asset_ids      BIGINT[],
  assigned_to    BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'pending_approval', 'approved', 'cancelled')),
  priority       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  created_by     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  taken_at       TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  approved_at    TIMESTAMPTZ,
  approved_by    BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  note           TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspection_tasks_assigned_to    ON inspection_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_status         ON inspection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_building_number ON inspection_tasks(building_number);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_created_at     ON inspection_tasks(created_at);

-- ============================================================================
-- 17. INSPECTION TASK HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspection_task_history (
  id           BIGSERIAL PRIMARY KEY,
  task_id      BIGINT NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  action       TEXT NOT NULL
    CHECK (action IN ('created', 'taken', 'submitted', 'returned', 'approved', 'cancelled')),
  comment_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspection_task_history_task_id    ON inspection_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_inspection_task_history_created_at ON inspection_task_history(created_at);

-- ============================================================================
-- 18. INSPECTION REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspection_reports (
  id           BIGSERIAL PRIMARY KEY,
  task_id      BIGINT NOT NULL UNIQUE REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  report_text  TEXT,
  reported_at  TIMESTAMPTZ,
  reported_by  BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_reports_task_id ON inspection_reports(task_id);

-- ============================================================================
-- 19. INSPECTION REPORT FILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspection_report_files (
  id          BIGSERIAL PRIMARY KEY,
  report_id   BIGINT NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  asset_id    BIGINT,
  file_path   TEXT NOT NULL,
  file_name   TEXT,
  file_type   TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inspection_report_files_report_id ON inspection_report_files(report_id);

-- ============================================================================
-- 20. INSPECTION TASK ACCESS TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspection_task_access_tokens (
  id         BIGSERIAL PRIMARY KEY,
  task_id    BIGINT NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_token   ON inspection_task_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_expires ON inspection_task_access_tokens(expires_at);

-- ============================================================================
-- 21. INSPECTOR OTP CODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspector_otp_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  task_id    BIGINT REFERENCES inspection_tasks(id) ON DELETE SET NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspector_otp_codes_otp     ON inspector_otp_codes(otp_code) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inspector_otp_codes_expires ON inspector_otp_codes(expires_at);

-- ============================================================================
-- DEFAULT USERS (passwords: admin=admin123, user=user123)
-- Hashes generated by passlib bcrypt and stored here.
-- Python services will verify using passlib.
-- ============================================================================

-- Insert default users; Python service will generate bcrypt hashes on first start
-- Actual hashes inserted by install.sh via Python
INSERT INTO users (user_name, user_email, user_role, active, auth_user_id)
VALUES ('default', NULL, 'user', true, NULL)
ON CONFLICT DO NOTHING;
