# Deploy folder (no Docker)

- **`bicep/`** – Azure Bicep to create the backend App Service (PostgreSQL settings, PGSSLMODE, optional Azure Storage).  
  Deploy from repo root:
  ```bash
  az group create --name rg-buildingsmanager --location israelcentral
  az deployment group create --resource-group rg-buildingsmanager \
    --template-file deploy/bicep/main.bicep \
    --parameters deploy/bicep/parameters.json \
    --parameters dbPassword='...' secretKey='...'
  ```
  Do not commit real `dbPassword` or `secretKey` in `parameters.json`; pass them on the command line. Optional: `azureStorageConnectionString` for file uploads.

- **GitHub Actions** (`.github/workflows/azure-backend.yml`, `azure-frontend.yml`) deploy backend and frontend without Docker.  
  **Full checklist and first-time setup:** **`docs/DEPLOYMENT.md`** (secrets, environment, Bicep, manual deploy).

- **Remove all except DB, then recreate:**  
  - **One command:** `.\deploy\reset-and-recreate.ps1` — deletes all old Web Apps, plans, Static Web Apps, and Storage in the RG (keeps PostgreSQL), then recreates them and deploys. You’ll be prompted for DB password and JWT secret.  
  - **Or in two steps:** `.\deploy\remove-all-except-db.ps1` then `.\deploy\recreate-with-existing-db.ps1`.
