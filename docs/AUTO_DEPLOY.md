# Auto-Deploy (GitHub Actions)

The app automatically deploys to production on each push to `main` or `master`.

## Setup

1. In your GitHub repo: **Settings → Secrets and variables → Actions**
2. Add these repository secrets:

   | Secret           | Description                         |
   |------------------|-------------------------------------|
   | `DEPLOY_HOST`    | Production server IP or hostname    |
   | `DEPLOY_USER`    | SSH user (e.g. `asset_flow`)        |
   | `DEPLOY_PASSWORD` | SSH password                        |
   | `DB_PASSWORD`    | PostgreSQL password (same as SSH if shared) |

3. Push to `main` or run **Actions → Deploy to Production → Run workflow** manually.

## What runs

- Full deployment via `scripts/run_deploy_remote.py`: uploads project, runs `scripts/deploy-production-ubuntu.sh` on the server
- Builds frontend, restarts backend, updates Nginx
- Runs in background on the server; monitor with `ssh user@host 'tail -f ~/deploy.log'`
