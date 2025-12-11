# PowerShell script to read Excel file and generate SQL migration
$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$excelPath = (Join-Path $scriptPath "..\public\asset_types.xlsx") | Resolve-Path
$outputPath = Join-Path $scriptPath "..\supabase\migrations\20251201012002_recreate_asset_types_table.sql"

Write-Host "Excel path: $excelPath" -ForegroundColor Cyan
Write-Host "Output path: $outputPath" -ForegroundColor Cyan

if (-not (Test-Path $excelPath)) {
    Write-Host "Error: Excel file not found at $excelPath" -ForegroundColor Red
    exit 1
}

# Map column positions (0-based) to English database column names
$columnPositions = @(
    "name",                    # 0
    "description",             # 1
    "tax_region",              # 2
    "elevator",                # 3
    "single_double_family",    # 4
    "penthouse",               # 5
    "condo",                   # 6
    "townhouses",              # 7
    "business_residence",        # 8
    "shared_area_usage",       # 9
    "min_size",                # 10
    "max_size"                 # 11
)

try {
    Write-Host "Opening Excel..." -ForegroundColor Yellow
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    
    Start-Sleep -Milliseconds 500
    
    Write-Host "Opening workbook..." -ForegroundColor Yellow
    $workbook = $excel.Workbooks.Open($excelPath, $false, $true)
    $worksheet = $workbook.Worksheets.Item(1)
    
    # Get used range
    $usedRange = $worksheet.UsedRange
    $rowCount = $usedRange.Rows.Count
    $colCount = $usedRange.Columns.Count
    
    Write-Host "Total rows: $rowCount" -ForegroundColor Green
    Write-Host "Total columns: $colCount" -ForegroundColor Green
    
    # Read all data rows (skip header row)
    Write-Host "Reading data rows..." -ForegroundColor Yellow
    $rows = @()
    for ($row = 2; $row -le $rowCount; $row++) {
        $rowData = @{}
        $hasData = $false
        
        for ($colIdx = 0; $colIdx -lt [Math]::Min($columnPositions.Count, $colCount); $colIdx++) {
            $col = $colIdx + 1
            $value = $worksheet.Cells.Item($row, $col).Text.Trim()
            $colName = $columnPositions[$colIdx]
            
            # Check if this is the name column and has a value
            if ($colName -eq "name" -and $value) {
                $hasData = $true
            }
            
            $rowData[$colName] = $value
        }
        
        # Only add rows that have a name value
        if ($hasData) {
            $rows += $rowData
        }
    }
    
    Write-Host "Read $($rows.Count) data rows" -ForegroundColor Green
    
    # Get the actual column names to use
    $dbColumns = $columnPositions | Where-Object { $_ -ne $null }
    
    # Generate SQL
    Write-Host "Generating SQL..." -ForegroundColor Yellow
    $sql = @"
/*
  # Recreate Asset Types Table from Excel File
  
  1. Changes
    - Drop existing asset_types table completely
    - Recreate with structure matching Excel columns
    - Import all data from asset_types.xlsx
  
  2. Table Structure
    - `id` (SERIAL) - Primary key
    - `name` (TEXT) - Asset type code/name
    - `description` (TEXT) - Description in Hebrew
    - `tax_region` (INTEGER) - Tax region code
    - `elevator` (TEXT) - Elevator yes/no indicator
    - `single_double_family` (TEXT) - Single/double family indicator
    - `penthouse` (TEXT) - Penthouse indicator
    - `condo` (TEXT) - Condo indicator
    - `townhouses` (TEXT) - Townhouses indicator
    - `business_residence` (TEXT) - Business/Residence indicator
    - `shared_area_usage` (TEXT) - Shared area usage indicator
    - `min_size` (NUMERIC) - Minimum size
    - `max_size` (NUMERIC) - Maximum size
    - `active` (TEXT) - Active status (default: 'כן')
    - `created_at` (TIMESTAMPTZ) - Creation timestamp
    - `updated_at` (TIMESTAMPTZ) - Update timestamp
  
  3. Security
    - Enable RLS on asset_types table
    - Allow anonymous and authenticated users full access
*/

-- Drop existing table and all dependent objects
DROP TABLE IF EXISTS asset_types CASCADE;

-- Recreate table with structure matching Excel
CREATE TABLE asset_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tax_region INTEGER,
  elevator TEXT,
  single_double_family TEXT,
  penthouse TEXT,
  condo TEXT,
  townhouses TEXT,
  business_residence TEXT,
  shared_area_usage TEXT,
  min_size NUMERIC,
  max_size NUMERIC,
  active TEXT DEFAULT 'כן',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on name for faster lookups
CREATE INDEX idx_asset_types_name ON asset_types(name);

-- Create index on tax_region for filtering
CREATE INDEX idx_asset_types_tax_region ON asset_types(tax_region);

-- Create index on active for filtering active/inactive records
CREATE INDEX idx_asset_types_active ON asset_types(active);

-- Enable RLS
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anonymous read access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous insert access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous update access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous delete access" ON asset_types;

-- Allow anonymous read access
CREATE POLICY "Allow anonymous read access"
  ON asset_types
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anonymous insert access
CREATE POLICY "Allow anonymous insert access"
  ON asset_types
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anonymous update access
CREATE POLICY "Allow anonymous update access"
  ON asset_types
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anonymous delete access
CREATE POLICY "Allow anonymous delete access"
  ON asset_types
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS update_asset_types_updated_at ON asset_types;
CREATE TRIGGER update_asset_types_updated_at
  BEFORE UPDATE ON asset_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment on active column
COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Values: "כן" (yes) or NULL (no)';

-- Insert all asset types from Excel
INSERT INTO asset_types ($($dbColumns -join ', ')) VALUES
"@
    
    # Generate INSERT values
    Write-Host "Generating INSERT statements..." -ForegroundColor Yellow
    $insertValues = @()
    foreach ($row in $rows) {
        $values = @()
        foreach ($col in $dbColumns) {
            $value = $row[$col]
            
            if ([string]::IsNullOrWhiteSpace($value)) {
                $values += "NULL"
            } elseif ($col -eq "tax_region" -or $col -eq "min_size" -or $col -eq "max_size") {
                # Try to parse as number
                $numValue = 0
                if ([double]::TryParse($value, [ref]$numValue)) {
                    $values += $numValue.ToString()
                } else {
                    # If it's not a number, store as NULL
                    $values += "NULL"
                }
            } else {
                # Escape single quotes
                $escaped = $value.Replace("'", "''")
                $values += "'$escaped'"
            }
        }
        $insertValues += "  ($($values -join ', '))"
    }
    
    $sql += "`n" + ($insertValues -join ",`n") + ";"
    $sql += "`n`n-- Total rows inserted: $($rows.Count)"
    
    # Write to file with UTF-8 encoding
    Write-Host "Writing migration file..." -ForegroundColor Yellow
    [System.IO.File]::WriteAllText($outputPath, $sql, [System.Text.Encoding]::UTF8)
    
    Write-Host "`nMigration file generated: $outputPath" -ForegroundColor Green
    Write-Host "Total rows to insert: $($rows.Count)" -ForegroundColor Green
    
    # Clean up
    $workbook.Close($false)
    $excel.Quit()
    
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($worksheet) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    
    Write-Host "Done!" -ForegroundColor Green
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
}

