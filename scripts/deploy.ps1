param(
  [switch] $NoBuild,
  [int] $AppPort = 3000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Edit POSTGRES_PASSWORD before deploying, then rerun this script."
  exit 1
}

function Set-EnvValue {
  param(
    [string] $Name,
    [string] $Value
  )

  $lines = Get-Content ".env"
  $updated = $false
  $nextLines = $lines | ForEach-Object {
    if ($_ -match "^$([regex]::Escape($Name))=") {
      $updated = $true
      "$Name=$Value"
    } else {
      $_
    }
  }

  if (-not $updated) {
    $nextLines += "$Name=$Value"
  }

  Set-Content ".env" -Value $nextLines -Encoding ASCII
}

if ($AppPort -le 0) {
  throw "AppPort must be greater than 0."
}

Set-EnvValue -Name "APP_PORT" -Value ([string]$AppPort)
$env:APP_PORT = [string]$AppPort
Write-Host "CaloriesDashboard will bind host port $AppPort to container port 3000."

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

$port = "$AppPort"
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^APP_PORT=(.+)$") {
    $port = $matches[1]
  }
}

Write-Host ""
Write-Host "Dashboard deployment requested. Open http://localhost:$port/ when the app healthcheck is healthy."
