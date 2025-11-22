# PowerShell script to parse CSV and generate SQL INSERT statements
$csvPath = "c:\Users\Owner\Downloads\asset_types_satureday.csv"

if (-not (Test-Path $csvPath)) {
    Write-Error "CSV file not found at $csvPath"
    exit 1
}

# Read CSV with UTF-8 encoding
$rows = Import-Csv -Path $csvPath -Encoding UTF8 -Header "name","description","tax_region","elevator","single_double_family","penthouse","condo","townhouses","min_size","max_size","basement"
# Note: basement column is read but will be excluded from INSERT

# Skip header row (first row)
$dataRows = $rows | Select-Object -Skip 1

$insertValues = @()

foreach ($row in $dataRows) {
    if ([string]::IsNullOrWhiteSpace($row.name)) {
        continue
    }
    
    # Format SQL values
    function Format-SqlValue($val) {
        if ([string]::IsNullOrWhiteSpace($val)) {
            return "NULL"
        }
        
        # Try to parse as number
        $numVal = 0
        if ([double]::TryParse($val, [ref]$numVal)) {
            return $numVal.ToString()
        }
        
        # Escape single quotes in strings
        $escaped = $val -replace "'", "''"
        return "'$escaped'"
    }
    
    $insertValues += "(" + 
        "$(Format-SqlValue $row.name), " +
        "$(Format-SqlValue $row.description), " +
        "$(Format-SqlValue $row.tax_region), " +
        "$(Format-SqlValue $row.elevator), " +
        "$(Format-SqlValue $row.single_double_family), " +
        "$(Format-SqlValue $row.penthouse), " +
        "$(Format-SqlValue $row.condo), " +
        "$(Format-SqlValue $row.townhouses), " +
        "$(Format-SqlValue $row.min_size), " +
        "$(Format-SqlValue $row.max_size)" +
    ")"
}

# Output SQL
Write-Output "-- Insert all asset types from CSV"
Write-Output "INSERT INTO asset_types (name, description, tax_region, elevator, single_double_family, penthouse, condo, townhouses, min_size, max_size) VALUES"
Write-Output ($insertValues -join ",`n") + ";"
Write-Host "Generated $($insertValues.Count) INSERT statements" -ForegroundColor Green

