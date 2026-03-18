# Run export on the source server via SSH and download the dump.
# Requires: SSH access to source (e.g. root@185.229.226.37).
# Set DB_NAME and DB_USER for the SOURCE server (or pass env to SSH).
#
# Usage:
#   $env:DB_NAME = "your_db"; $env:DB_USER = "your_user"; .\export-via-ssh.ps1
#   Or edit DEFAULT_DB_NAME / DEFAULT_DB_USER below.

param(
    [string]$SshTarget = "root@185.229.226.37",
    [string]$DbName = $env:DB_NAME,
    [string]$DbUser = $env:DB_USER
)

if (-not $DbName -or -not $DbUser) {
    Write-Host "Set DB_NAME and DB_USER (source server Postgres). Example:"
    Write-Host '  $env:DB_NAME = "buildingsmanager"; $env:DB_USER = "postgres"; .\export-via-ssh.ps1'
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExportScript = Join-Path $ScriptDir "export-tables.sh"
$RemotePath = "/tmp/export-tables.sh"
$RemoteDump = "/tmp/buildingsmanager_data_export.sql"
$LocalDump = Join-Path $ScriptDir "buildingsmanager_data_export.sql"

Write-Host "Uploading export script..."
scp $ExportScript "${SshTarget}:${RemotePath}"

Write-Host "Running export on server (DB_NAME=$DbName, DB_USER=$DbUser)..."
ssh $SshTarget "DB_NAME='$DbName' DB_USER='$DbUser' bash $RemotePath"

Write-Host "Downloading dump..."
scp "${SshTarget}:${RemoteDump}" $LocalDump

Write-Host "Done. Dump saved to: $LocalDump"
