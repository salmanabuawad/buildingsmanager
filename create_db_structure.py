#!/usr/bin/env python3
"""
Create complete database structure: init_db, migrations, and seed
"""
import requests
import json
import os
from datetime import datetime

SUPABASE_URL = 'https://mmqnrwjjxewrgwczezzf.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tcW5yd2pqeGV3cmd3Y3plenpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDY5MzMsImV4cCI6MjA4NTAyMjkzM30.ov9r3vyMsRwhSaqQ_3wlPtGTjiK-Rn36BAgbT_zGu1E'

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json'
}

def get_table_data(table_name, limit=10000):
    """Get all data from a table"""
    try:
        url = f'{SUPABASE_URL}/rest/v1/{table_name}'
        params = {'limit': limit, 'select': '*'}
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"  Error fetching {table_name}: {e}")
    return []

def discover_tables():
    """Discover tables"""
    common_tables = [
        'assets', 'buildings', 'asset_types', 'address_list', 'audit_log',
        'validation_rules', 'users', 'user_roles', 'field_config',
        'asset_files', 'building_files', 'distribution_history', 'transfer_history'
    ]
    
    discovered = []
    for table in common_tables:
        try:
            url = f'{SUPABASE_URL}/rest/v1/{table}'
            response = requests.get(url, headers=headers, params={'limit': 1})
            if response.status_code == 200:
                discovered.append(table)
                print(f"Found table: {table}")
        except:
            pass
    
    return discovered

def generate_create_table_sql(table_name, columns, sample_data):
    """Generate CREATE TABLE SQL from column information"""
    if not sample_data:
        return f"-- Table: {table_name}\n-- No data available to infer schema\n\n"
    
    # Infer types from sample data
    sql = f"-- Table: {table_name}\n"
    sql += f"CREATE TABLE IF NOT EXISTS {table_name} (\n"
    
    col_defs = []
    for col in columns:
        col_name = col
        sample_value = sample_data[0].get(col) if sample_data else None
        
        # Infer PostgreSQL type
        if sample_value is None:
            pg_type = "TEXT"
        elif isinstance(sample_value, bool):
            pg_type = "BOOLEAN"
        elif isinstance(sample_value, int):
            pg_type = "BIGINT"
        elif isinstance(sample_value, float):
            pg_type = "NUMERIC"
        elif isinstance(sample_value, str):
            # Check if it's a date
            if '/' in sample_value and len(sample_value) == 10:
                pg_type = "TEXT"  # DD/MM/YYYY format
            elif 'T' in sample_value and 'Z' in sample_value:
                pg_type = "TIMESTAMPTZ"
            else:
                pg_type = "TEXT"
        else:
            pg_type = "TEXT"
        
        nullable = "NULL" if sample_data[0].get(col) is None else "NOT NULL"
        col_defs.append(f"    {col_name} {pg_type} {nullable}")
    
    sql += ",\n".join(col_defs)
    sql += "\n);\n\n"
    return sql

def generate_seed_sql(table_name, data):
    """Generate SQL INSERT statements"""
    if not data:
        return ''
    
    sql = f'-- Seed data for {table_name} ({len(data)} rows)\n'
    
    columns = list(data[0].keys())
    sql += f'INSERT INTO {table_name} ({", ".join(columns)}) VALUES\n'
    
    values = []
    for row in data:
        row_values = []
        for col in columns:
            val = row.get(col)
            if val is None:
                row_values.append('NULL')
            elif isinstance(val, str):
                escaped = val.replace("'", "''")
                row_values.append(f"'{escaped}'")
            elif isinstance(val, bool):
                row_values.append('true' if val else 'false')
            elif isinstance(val, (int, float)):
                row_values.append(str(val))
            elif isinstance(val, dict):
                row_values.append(f"'{json.dumps(val).replace("'", "''")}'::jsonb")
            elif isinstance(val, list):
                row_values.append(f"'{json.dumps(val).replace("'", "''")}'::jsonb")
            else:
                row_values.append(f"'{str(val).replace("'", "''")}'")
        
        values.append(f"({', '.join(row_values)})")
    
    sql += ',\n'.join(values) + ';\n\n'
    return sql

def main():
    print("Creating database structure...")
    
    # Discover tables
    tables = discover_tables()
    print(f"\nFound {len(tables)} tables\n")
    
    # Create directories
    os.makedirs('migrations', exist_ok=True)
    os.makedirs('seed', exist_ok=True)
    
    # Generate init_db.sql
    init_db_sql = "-- Database Initialization Script\n"
    init_db_sql += f"-- Generated at: {datetime.now().isoformat()}\n\n"
    init_db_sql += "-- This file creates all tables, constraints, indexes, functions, and triggers\n"
    init_db_sql += "-- Run extract_full_schema.sql in Supabase SQL Editor to get complete schema\n"
    init_db_sql += "-- Then copy the CREATE TABLE statements here\n\n"
    
    # Generate seed.sql
    seed_sql = "-- Seed Data\n"
    seed_sql += f"-- Generated at: {datetime.now().isoformat()}\n\n"
    seed_sql += "-- WARNING: This will insert/update data. Use with caution!\n"
    seed_sql += "-- Consider using TRUNCATE or DELETE before inserting if needed\n\n"
    
    # Extract data and generate SQL
    for table in tables:
        print(f"Processing: {table}")
        data = get_table_data(table)
        
        if data:
            # Generate CREATE TABLE (basic version - will need schema from Supabase)
            columns = list(data[0].keys())
            init_db_sql += generate_create_table_sql(table, columns, data)
            
            # Generate seed data
            seed_sql += generate_seed_sql(table, data)
            print(f"  Extracted {len(data)} rows")
    
    # Write init_db.sql
    with open('init_db.sql', 'w', encoding='utf-8') as f:
        f.write(init_db_sql)
    
    # Write seed.sql
    with open('seed/seed.sql', 'w', encoding='utf-8') as f:
        f.write(seed_sql)
    
    # Create migration template
    migration_template = f"""-- Migration: {datetime.now().strftime('%Y%m%d%H%M%S')}_initial_schema.sql
-- Description: Initial database schema

-- Run extract_full_schema.sql in Supabase SQL Editor first to get complete schema
-- Then copy the relevant CREATE statements here

"""
    
    with open('migrations/00000000000000_initial_schema.sql', 'w', encoding='utf-8') as f:
        f.write(migration_template)
    
    print(f"\nStructure created!")
    print(f"  - init_db.sql (table creation)")
    print(f"  - migrations/00000000000000_initial_schema.sql (migration template)")
    print(f"  - seed/seed.sql (seed data)")
    print(f"\nNext steps:")
    print(f"  1. Run extract_full_schema.sql in Supabase SQL Editor")
    print(f"  2. Copy CREATE TABLE statements to init_db.sql and migrations")
    print(f"  3. Run seed/seed.sql to populate data")

if __name__ == '__main__':
    main()
