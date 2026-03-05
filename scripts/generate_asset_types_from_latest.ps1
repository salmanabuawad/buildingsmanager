# PowerShell script to read Excel file and generate SQL INSERT statements
$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$excelPath = (Join-Path $scriptPath "..\data\asset_types_latest.xlsx") | Resolve-Path
$outputPath = Join-Path $scriptPath "..\migrations\import_asset_types_latest.sql"

Write-Host "Excel path: $excelPath" -ForegroundColor Cyan
Write-Host "Output path: $outputPath" -ForegroundColor Cyan

if (-not (Test-Path $excelPath)) {
    Write-Host "Error: Excel file not found at $excelPath" -ForegroundColor Red
    exit 1
}

# Map column positions (0-based) to English database column names
# Based on the schema: name, description, tax_region, elevator, single_double_family, penthouse, condo, townhouses, business_residence, min_size, max_size
$columnPositions = @(
    "name",                    # 0
    "description",             # 1
    "tax_region",              # 2
    "elevator",                # 3
    "single_double_family",    # 4
    "penthouse",               # 5
    "condo",                   # 6
    "townhouses",              # 7
    "business_residence",      # 8
    "min_size",                # 9
    "max_size"                 # 10
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
    
    # Generate SQL INSERT statements
    Write-Host "Generating SQL..." -ForegroundColor Yellow
    $sql = @"
-- Import asset types from asset_types_latest.xlsx
-- Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

-- Clear existing data (optional - comment out if you want to keep existing data)
-- DELETE FROM asset_types;

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
    Write-Host "Writing SQL file..." -ForegroundColor Yellow
    [System.IO.File]::WriteAllText($outputPath, $sql, [System.Text.Encoding]::UTF8)
    
    Write-Host "`nSQL file generated: $outputPath" -ForegroundColor Green
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
