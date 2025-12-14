# PowerShell script to export tables, fields, and types to CSV
# Usage: .\export_tables_fields_types.ps1

# Database connection parameters - UPDATE THESE
$dbHost = "localhost"
$dbPort = "5432"
$dbName = "your_database"
$dbUser = "your_user"
$dbPassword = "your_password"

# Output file
$outputFile = "tables_fields_types.csv"

# SQL query
$query = @"
SELECT 
    table_name,
    column_name as field_name,
    CASE 
        WHEN character_maximum_length IS NOT NULL 
        THEN data_type || '(' || character_maximum_length || ')'
        WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL
        THEN data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
        WHEN numeric_precision IS NOT NULL
        THEN data_type || '(' || numeric_precision || ')'
        ELSE data_type
    END as field_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
"@

# Export using psql
$env:PGPASSWORD = $dbPassword
$psqlCommand = "psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c `"COPY ($query) TO STDOUT WITH CSV HEADER`" -o $outputFile"

Write-Host "Exporting tables, fields, and types to $outputFile..."
Invoke-Expression $psqlCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "Export completed successfully! File saved to: $outputFile"
} else {
    Write-Host "Export failed. Please check your database connection parameters."
}
