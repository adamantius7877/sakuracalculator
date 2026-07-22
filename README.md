# Calorie Counter Dashboard

A self-hosted calorie dashboard for tracking foods, meal logs, weight-loss goals,
and calorie targets. The app supports local user profiles, Google Sheet CSV
imports, USDA FoodData Central lookup, and dynamic weight projections.

## Production Stack

- Next.js app server
- PostgreSQL database
- Docker Compose for app + database
- PowerShell scripts for Windows deployment and backups

Browser storage is still used as a fallback. When `DATABASE_URL` is configured,
the app loads and saves dashboard state through PostgreSQL.

## Local Development

```powershell
pnpm install
pnpm run dev
```

Open `http://localhost:3000`.

## Docker Deployment

Prerequisites on the server:

- Docker Desktop or Docker Engine
- Docker Compose v2
- PowerShell 7 or Windows PowerShell

First deployment:

```powershell
Copy-Item .env.example .env
notepad .env
.\scripts\deploy.ps1
```

Change `POSTGRES_PASSWORD` in `.env` before running `deploy.ps1`. The app will
build, start PostgreSQL, run migrations, and expose the dashboard on
`APP_PORT`.

Redeploy after code changes:

```powershell
.\scripts\deploy.ps1
```

Restart without rebuilding:

```powershell
.\scripts\deploy.ps1 -NoBuild
```

## Database

Migrations live in `db/migrations/`. The production container runs:

```bash
node scripts/migrate.mjs
```

before starting the app server.

Main tables:

- `user_profiles`: body, goal, activity, HRT, and planned-intake settings
- `foods`: shared food library
- `log_entries`: meal logs separated by active profile
- `app_settings`: active profile and USDA API key

## Backups

Create a PostgreSQL backup:

```powershell
.\scripts\backup-db.ps1
```

Backups are written to `backups/`.

Restore a backup:

```powershell
.\scripts\restore-db.ps1 -Path .\backups\calories-dashboard-YYYYMMDD-HHMMSS.sql
```

## Useful Commands

```powershell
pnpm run build
pnpm test
pnpm run db:migrate
docker compose logs -f app
docker compose ps
```
