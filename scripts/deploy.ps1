param(
  [switch] $NoBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Edit POSTGRES_PASSWORD before deploying, then rerun this script."
  exit 1
}

$dbContainer = docker compose ps --status running -q db 2>$null
if ($dbContainer) {
  Write-Host "Creating a PostgreSQL backup before deployment..."
  & (Join-Path $PSScriptRoot "backup-db.ps1")
} else {
  Write-Host "No running database container found. Skipping pre-deploy backup."
}

$composeArgs = @("compose", "up", "-d")
if (-not $NoBuild) {
  $composeArgs += "--build"
}

docker @composeArgs
docker compose ps

$port = "3000"
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^APP_PORT=(.+)$") {
    $port = $matches[1]
  }
}

Write-Host ""
Write-Host "Dashboard deployment requested. Open http://localhost:$port/ when the app healthcheck is healthy."
