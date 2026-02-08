#!/usr/bin/env python3
"""
Extract complete database structure from Supabase
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

def get_tables():
    """Get list of all tables"""
    try:
        # Try to get tables from REST API by querying information_schema
        # Since we can't directly query information_schema via REST, we'll try to discover tables
        # by attempting to query common table names or use PostgREST introspection
        
        # Alternative: Use PostgREST to get schema
        response = requests.get(f'{SUPABASE_URL}/rest/v1/', headers=headers)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"Error getting tables: {e}")
    return []

def get_table_data(table_name, limit=10000):
    """Get all data from a table"""
    try:
        url = f'{SUPABASE_URL}/rest/v1/{table_name}'
        params = {'limit': limit, 'select': '*'}
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"  Error fetching {table_name}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"  Error fetching {table_name}: {e}")
    return []

def discover_tables():
    """Discover tables by trying common names or using RPC"""
    # Common table names to try - based on the codebase
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
            elif response.status_code == 404:
                # Table doesn't exist, skip
                pass
            else:
                # Might exist but have permission issues, try anyway
                discovered.append(table)
                print(f"Found table (may have limited access): {table}")
        except Exception as e:
            pass
    
    return discovered

def generate_seed_sql(table_name, data):
    """Generate SQL INSERT statements"""
    if not data:
        return ''
    
    sql = f'-- Table: {table_name}\n'
    sql += f'-- {len(data)} rows\n\n'
    
    # Get column names from first row
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
                # Escape single quotes
                escaped = val.replace("'", "''")
                row_values.append(f"'{escaped}'")
            elif isinstance(val, bool):
                row_values.append('true' if val else 'false')
            elif isinstance(val, (int, float)):
                row_values.append(str(val))
            elif isinstance(val, dict):
                # JSON object
                row_values.append(f"'{json.dumps(val).replace("'", "''")}'::jsonb")
            elif isinstance(val, list):
                # JSON array
                row_values.append(f"'{json.dumps(val).replace("'", "''")}'::jsonb")
            else:
                row_values.append(f"'{str(val).replace("'", "''")}'")
        
        values.append(f"({', '.join(row_values)})")
    
    sql += ',\n'.join(values) + ';\n\n'
    return sql

def main():
    print("Discovering database structure...")
    
    output = {
        'extracted_at': datetime.now().isoformat(),
        'tables': [],
        'seed_data': {}
    }
    
    # Discover tables
    tables = discover_tables()
    print(f"\nFound {len(tables)} tables\n")
    
    # Extract data from each table
    all_seed_sql = '-- Seed Data\n'
    all_seed_sql += f'-- Extracted at: {datetime.now().isoformat()}\n\n'
    
    for table in tables:
        print(f"Extracting data from: {table}")
        data = get_table_data(table)
        
        if data:
            output['tables'].append({
                'name': table,
                'row_count': len(data),
                'columns': list(data[0].keys()) if data else []
            })
            output['seed_data'][table] = data
            all_seed_sql += generate_seed_sql(table, data)
            print(f"  Extracted {len(data)} rows")
        else:
            print(f"  No data or error")
    
    # Create output directory
    output_dir = 'db_structure'
    os.makedirs(output_dir, exist_ok=True)
    
    # Save JSON structure
    with open(f'{output_dir}/complete_structure.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)
    
    # Save seed data separately
    with open(f'{output_dir}/seed_data.json', 'w', encoding='utf-8') as f:
        json.dump(output['seed_data'], f, indent=2, ensure_ascii=False, default=str)
    
    # Save SQL seed file
    with open(f'{output_dir}/seed_data.sql', 'w', encoding='utf-8') as f:
        f.write(all_seed_sql)
    
    print(f"\nExtraction complete!")
    print(f"Output saved to: {output_dir}/")
    print(f"   - complete_structure.json")
    print(f"   - seed_data.json")
    print(f"   - seed_data.sql")

if __name__ == '__main__':
    main()
