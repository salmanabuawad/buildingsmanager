# Deploy dist/ to Azure Static Web Apps without PowerShell treating CLI stderr as error.
# Usage: .\scripts\deploy-static-azure.ps1
# Token from: env AZURE_STATIC_WEB_APPS_API_TOKEN, -Token "…", or repo-root .deploy-token (gitignored)
param([string] $Token = $env:AZURE_STATIC_WEB_APPS_API_TOKEN)
# Repo root = parent of the folder containing this script (e.g. .../buildingsmanager when script is in .../buildingsmanager/scripts)
$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { $PWD.Path }
$tokenFile = Join-Path $root ".deploy-token"
if (-not $Token -and (Test-Path -LiteralPath $tokenFile)) {
    $Token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
}
Set-Location $root
if (-not $Token) {
    Write-Host "Set AZURE_STATIC_WEB_APPS_API_TOKEN, use -Token '…', or create .deploy-token in repo root." -ForegroundColor Red
    exit 1
}
$distPath = Join-Path $root "dist"
if (-not (Test-Path $distPath)) {
    Write-Host "Building frontend (dist not found)..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Test-Path $distPath)) {
    Write-Host "Run 'npm run build' first (dist still missing)." -ForegroundColor Red
    exit 1
}
# Run via cmd so PowerShell does not treat "Preparing deployment..." (stderr) as NativeCommandError
cmd /c "npx --yes @azure/static-web-apps-cli deploy $distPath --deployment-token $Token --no-use-keychain"
exit $LASTEXITCODE
