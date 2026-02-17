-- Azure PostgreSQL Database Schema for AssetFlow
-- This schema is adapted from the Supabase version for Azure PostgreSQL

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'viewer',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- Create buildings table
CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    building_id VARCHAR(50) UNIQUE NOT NULL,
    building_name VARCHAR(255),
    street_name VARCHAR(255),
    house_number VARCHAR(50),
    entrance VARCHAR(50),
    city VARCHAR(100),
    neighborhood VARCHAR(100),
    total_area NUMERIC(10, 2),
    shared_area NUMERIC(10, 2),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_buildings_building_id ON buildings(building_id);

-- Create asset_types table
CREATE TABLE IF NOT EXISTS asset_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE,
    use_shared_area BOOLEAN DEFAULT false,
    not_accountable_for_statistics BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Create assets table
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    asset_id VARCHAR(50) UNIQUE NOT NULL,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    asset_type_id INTEGER REFERENCES asset_types(id),

    apartment_number VARCHAR(50),
    storage_number VARCHAR(50),
    apartment_owner VARCHAR(255),
    business_name VARCHAR(255),

    measured_area NUMERIC(10, 2),
    cadastral_area NUMERIC(10, 2),
    balcony_area NUMERIC(10, 2),
    area_from_distribution NUMERIC(10, 2),
    business_total_area NUMERIC(10, 2),

    tax_region VARCHAR(50),

    distribution_flag BOOLEAN DEFAULT false,
    distribution_flag_business_residence BOOLEAN DEFAULT false,

    comment TEXT,
    export_to_automation_at VARCHAR(20),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_assets_asset_id ON assets(asset_id);
CREATE INDEX idx_assets_building_id ON assets(building_id);
CREATE INDEX idx_assets_asset_type_id ON assets(asset_type_id);

-- Create asset_files table
CREATE TABLE IF NOT EXISTS asset_files (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    measurement_date TIMESTAMP WITH TIME ZONE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_by UUID REFERENCES users(id)
);

CREATE INDEX idx_asset_files_asset_id ON asset_files(asset_id);

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    old_values TEXT,
    new_values TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tax_region VARCHAR(50)
);

CREATE INDEX idx_audit_entity ON audit(entity_type, entity_id);
CREATE INDEX idx_audit_changed_at ON audit(changed_at);

-- Create address_list table
CREATE TABLE IF NOT EXISTS address_list (
    id SERIAL PRIMARY KEY,
    street_code VARCHAR(50),
    street_name VARCHAR(255),
    city VARCHAR(100)
);

CREATE INDEX idx_address_list_street_code ON address_list(street_code);

-- Create field_configurations table
CREATE TABLE IF NOT EXISTS field_configurations (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255),
    display_order INTEGER,
    visible BOOLEAN DEFAULT true,
    width INTEGER,
    pinned VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(table_name, field_name)
);

-- Create validation_rules table
CREATE TABLE IF NOT EXISTS validation_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    rule_value TEXT,
    error_message TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Insert default admin user (password: WaveLync1342#)
INSERT INTO users (username, email, hashed_password, full_name, role)
VALUES (
    'admin',
    'admin@assetflow.com',
    '$2b$12$yJpbXUgFbwwfcbVpk./FTeuPeEVdixhXhFsk7b1iGv/B/UqF0b9ae',
    'System Administrator',
    'admin'
) ON CONFLICT (username) DO NOTHING;
