param(
  [Parameter(Mandatory = $true)]
  [string] $Path
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $Path)) {
  throw "Backup file not found: $Path"
}

$envValues = @{}
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
    $envValues[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$dbUser = $envValues["POSTGRES_USER"]
$dbName = $envValues["POSTGRES_DB"]

Get-Content $Path | docker compose exec -T db psql -U $dbUser $dbName
