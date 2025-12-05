# PowerShell script to read Excel file and generate INSERT statements only
$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$excelPath = (Join-Path $scriptPath "..\public\asset_types.xlsx") | Resolve-Path

Write-Host "Reading Excel file: $excelPath" -ForegroundColor Cyan

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
    "business_private",       # 8
    "shared_area_usage",       # 9
    "min_size",                # 10
    "max_size"                 # 11
)

try {
    # Try to kill any existing Excel processes first
    Get-Process excel -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    Write-Host "Opening Excel..." -ForegroundColor Yellow
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $excel.EnableEvents = $false
    
    Start-Sleep -Milliseconds 1000
    
    Write-Host "Opening workbook..." -ForegroundColor Yellow
    $workbook = $excel.Workbooks.Open($excelPath, $false, $true, $null, $null, $null, $true)
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
    
    # Generate INSERT statements
    Write-Host "Generating INSERT statements..." -ForegroundColor Yellow
    
    $outputPath = Join-Path $scriptPath "..\supabase\migrations\20251201012002_recreate_asset_types_table.sql"
    
    $insertSql = "`n-- Insert all asset types from Excel`n"
    $insertSql += "INSERT INTO asset_types ($($dbColumns -join ', ')) VALUES`n"
    
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
    
    $insertSql += ($insertValues -join ",`n") + ";`n"
    $insertSql += "`n-- Total rows inserted: $($rows.Count)`n"
    
    # Append to migration file
    Add-Content -Path $outputPath -Value $insertSql -Encoding UTF8
    
    Write-Host "INSERT statements appended to migration file" -ForegroundColor Green
    Write-Host "Total rows: $($rows.Count)" -ForegroundColor Green
    
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
    exit 1
}

