$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  throw ".env is missing. Copy .env.example to .env first."
}

$envValues = @{}
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
    $envValues[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$dbUser = $envValues["POSTGRES_USER"]
$dbName = $envValues["POSTGRES_DB"]
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $root "backups"
$backupPath = Join-Path $backupDir "calories-dashboard-$stamp.sql"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
docker compose exec -T db pg_dump -U $dbUser $dbName | Set-Content -Encoding UTF8 $backupPath

Write-Host "Backup written to $backupPath"
