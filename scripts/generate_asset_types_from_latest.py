#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to read Excel file and generate SQL INSERT statements for asset_types table
"""
import sys
import os
from pathlib import Path
import pandas as pd

# Get script directory
script_dir = Path(__file__).parent
project_root = script_dir.parent

# File paths
excel_path = project_root / "supabase" / "data" / "asset_types_latest.xlsx"
output_path = project_root / "supabase" / "migrations" / "import_asset_types_latest.sql"

print(f"Excel path: {excel_path}")
print(f"Output path: {output_path}")

if not excel_path.exists():
    print(f"Error: Excel file not found at {excel_path}", file=sys.stderr)
    sys.exit(1)

# Map column positions to database column names
# Excel columns (Hebrew):
# 0: 'סוג נכס' (name)
# 1: 'תיאור' (description)
# 2: 'אזור מיסים' (tax_region)
# 3: 'תיאור אזור לתצוגה בלשונית' (area_description_for_tab)
# 4: 'מעלית' (elevator)
# 5: 'בית פרטי חד משפחתי דו משפחתי' (single_double_family)
# 6: 'דירת גג' (penthouse)
# 7: 'בית משותף' (condo)
# 8: 'מבנים צמודי קרקע טוריים מעל 2 יחידות' (townhouses)
# 9: 'עסקים/מגורים' (business_residence)
# 10: 'לא נספר בחישוב שטח מבנה' (non_accountable_for_total_area - boolean)
# 11: 'לא נספר בפיזור' (non_accountable_for_distribution - boolean)
# 12: 'לא נספר בסטטיסטיקה' (not_accountable_for_statistics - boolean)
# 13: 'שטח מ' (min_size)
# 14: 'שטח עד' (max_size)
column_mapping = [
    ("name", 0, None),                              # 0: name
    ("description", 1, None),                       # 1: description
    ("tax_region", 2, "int"),                       # 2: tax_region
    ("area_description_for_tab", 3, None),          # 3: area_description_for_tab
    ("elevator", 4, "bool"),                        # 4: elevator (BOOLEAN in DB)
    ("single_double_family", 5, "bool"),            # 5: single_double_family (BOOLEAN in DB)
    ("penthouse", 6, "bool"),                       # 6: penthouse (BOOLEAN in DB)
    ("condo", 7, "bool"),                           # 7: condo (BOOLEAN in DB)
    ("townhouses", 8, "bool"),                      # 8: townhouses (BOOLEAN in DB)
    ("business_residence", 9, None),                 # 9: business_residence
    ("non_accountable_for_total_area", 10, "bool"),  # 10: non_accountable_for_total_area
    ("non_accountable_for_distribution", 11, "bool"), # 11: non_accountable_for_distribution
    ("not_accountable_for_statistics", 12, "bool"),  # 12: not_accountable_for_statistics
    ("min_size", 13, "numeric"),                    # 13: min_size
    ("max_size", 14, "numeric")                     # 14: max_size
]

try:
    # Read Excel file
    print("Reading Excel file...")
    df = pd.read_excel(excel_path, header=0)
    
    print(f"Total rows: {len(df)}")
    print(f"Total columns: {len(df.columns)}")
    
    # Filter rows that have a name value
    rows = []
    for idx, row in df.iterrows():
        # Check if name column has a value
        name_value = row.iloc[0] if len(row) > 0 else None
        if pd.notna(name_value):
            row_data = {}
            for col_name, col_idx, col_type in column_mapping:
                if col_idx < len(row):
                    value = row.iloc[col_idx]
                    if pd.isna(value):
                        row_data[col_name] = None
                    else:
                        row_data[col_name] = value
                else:
                    row_data[col_name] = None
            rows.append(row_data)
    
    print(f"Read {len(rows)} data rows")
    
    # Get the actual column names to use
    db_columns = [col[0] for col in column_mapping]
    
    # Generate SQL
    print("Generating SQL...")
    sql = f"""-- Import asset types from asset_types_latest.xlsx
-- Generated on {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}

-- Clear existing data (optional - comment out if you want to keep existing data)
-- DELETE FROM asset_types;

-- Insert all asset types from Excel
INSERT INTO asset_types ({', '.join(db_columns)}) VALUES
"""
    
    # Generate INSERT values
    print("Generating INSERT statements...")
    insert_values = []
    for row in rows:
        values = []
        for col_name, col_idx, col_type in column_mapping:
            value = row[col_name]
            
            if value is None or (isinstance(value, float) and pd.isna(value)):
                # For boolean fields with NOT NULL constraint, use false instead of NULL
                if col_type == "bool":
                    values.append("false")
                else:
                    values.append("NULL")
            elif col_type == "int":
                # Try to parse as integer
                try:
                    int_value = int(float(value))
                    values.append(str(int_value))
                except (ValueError, TypeError):
                    values.append("NULL")
            elif col_type == "numeric":
                # Try to parse as number
                try:
                    num_value = float(value)
                    values.append(str(int(num_value) if num_value.is_integer() else num_value))
                except (ValueError, TypeError):
                    values.append("NULL")
            elif col_type == "bool":
                # Convert Hebrew 'כן'/'לא' to boolean
                # These fields have NOT NULL constraint, so use false as default
                str_value = str(value).strip()
                if str_value == 'כן' or str_value.lower() == 'yes' or str_value == '1' or str_value.lower() == 'true':
                    values.append("true")
                else:
                    # Default to false for empty, 'לא', 'no', '0', 'false', or any other value
                    values.append("false")
            else:
                # Escape single quotes in strings
                escaped = str(value).replace("'", "''")
                values.append(f"'{escaped}'")
        
        insert_values.append(f"  ({', '.join(values)})")
    
    sql += ",\n".join(insert_values) + ";\n"
    sql += f"\n-- Total rows inserted: {len(rows)}\n"
    
    # Write to file with UTF-8 encoding
    print("Writing SQL file...")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(sql)
    
    print(f"\nSQL file generated: {output_path}")
    print(f"Total rows to insert: {len(rows)}")
    print("Done!")
    
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc()
    sys.exit(1)
