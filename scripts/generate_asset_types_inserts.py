#!/usr/bin/env python3
"""
Script to parse asset_types_satureday.csv and generate SQL INSERT statements
Handles Hebrew text encoding properly
"""

import csv
import sys
import os

def main():
    # CSV file path
    csv_path = r'c:\Users\Owner\Downloads\asset_types_satureday.csv'
    
    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found at {csv_path}", file=sys.stderr)
        sys.exit(1)
    
    rows = []
    
    # Try different encodings
    encodings = ['utf-8-sig', 'utf-8', 'windows-1255', 'iso-8859-8']
    
    for encoding in encodings:
        try:
            with open(csv_path, 'r', encoding=encoding) as f:
                reader = csv.reader(f)
                # Skip header row
                next(reader, None)
                
                for row in reader:
                    if len(row) < 3 or not row[0].strip():
                        continue
                    
                    # Extract and clean values
                    name = row[0].strip() if len(row) > 0 else ''
                    description = row[1].strip() if len(row) > 1 and row[1] else None
                    tax_region = row[2].strip() if len(row) > 2 and row[2] else None
                    elevator = row[3].strip() if len(row) > 3 and row[3] else None
                    single_double_family = row[4].strip() if len(row) > 4 and row[4] else None
                    penthouse = row[5].strip() if len(row) > 5 and row[5] else None
                    condo = row[6].strip() if len(row) > 6 and row[6] else None
                    townhouses = row[7].strip() if len(row) > 7 and row[7] else None
                    min_size = row[8].strip() if len(row) > 8 and row[8] else None
                    max_size = row[9].strip() if len(row) > 9 and row[9] else None
                    basement = row[10].strip() if len(row) > 10 and row[10] else None
                    
                    # Format SQL values
                    def sql_value(val):
                        if not val or val == '':
                            return 'NULL'
                        try:
                            # Try to convert to number
                            num_val = float(val)
                            return str(num_val)
                        except (ValueError, TypeError):
                            # Escape single quotes in strings
                            escaped = val.replace("'", "''")
                            return f"'{escaped}'"
                    
                    rows.append({
                        'name': sql_value(name),
                        'description': sql_value(description),
                        'tax_region': sql_value(tax_region),
                        'elevator': sql_value(elevator),
                        'single_double_family': sql_value(single_double_family),
                        'penthouse': sql_value(penthouse),
                        'condo': sql_value(condo),
                        'townhouses': sql_value(townhouses),
                        'min_size': sql_value(min_size),
                        'max_size': sql_value(max_size),
                        'basement': sql_value(basement)
                    })
                
                print(f"-- Successfully parsed {len(rows)} rows using encoding: {encoding}", file=sys.stderr)
                break
                
        except UnicodeDecodeError:
            continue
        except Exception as e:
            print(f"Error with encoding {encoding}: {e}", file=sys.stderr)
            continue
    
    if not rows:
        print("Error: Could not parse CSV file with any encoding", file=sys.stderr)
        sys.exit(1)
    
    # Generate SQL INSERT statements
    print("-- Insert all asset types from CSV")
    print("INSERT INTO asset_types (name, description, tax_region, elevator, single_double_family, penthouse, condo, townhouses, min_size, max_size, basement) VALUES")
    
    values = []
    for row in rows:
        values.append(
            f"({row['name']}, {row['description']}, {row['tax_region']}, "
            f"{row['elevator']}, {row['single_double_family']}, {row['penthouse']}, "
            f"{row['condo']}, {row['townhouses']}, {row['min_size']}, "
            f"{row['max_size']}, {row['basement']})"
        )
    
    print(",\n".join(values) + ";")
    print(f"\n-- Total rows: {len(rows)}", file=sys.stderr)

if __name__ == '__main__':
    main()

