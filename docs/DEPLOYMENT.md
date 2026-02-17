# Azure deployment (no Docker)

Deploy the backend to **Azure App Service** (Python) and the frontend to **Azure Static Web Apps**. Database: existing **Azure PostgreSQL** (Israel).

---

## 0. First-time setup (GitHub Actions)

To use the automated workflows (`.github/workflows/azure-frontend.yml` and `azure-backend.yml`):

1. **Create GitHub Environment (for backend):**  
   Repo → **Settings** → **Environments** → **New environment** → name: `production`. (Or remove `environment: production` from `azure-backend.yml` if you don’t use environments.)

2. **Backend deploy** needs one **Actions secret**:
   - `AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND` — full contents of the App Service **publish profile** (Deployment Center → Manage publish profile → Download).

3. **Frontend deploy** needs one **Actions secret**:
   - `AZURE_STATIC_WEB_APPS_API_TOKEN` — **deployment token** from the Static Web App (resource → Manage deployment token).

4. **Optional (recommended):** Repo **Variables** (or Secrets) → add `VITE_API_URL` = `https://buildingsmanager-api.azurewebsites.net/api` (or your backend URL + `/api`) so the frontend build uses the correct API.

5. Workflows run on **push to `main`** (and on **workflow_dispatch**). Ensure `AZURE_WEBAPP_NAME` in `azure-backend.yml` matches your App Service name (e.g. `buildingsmanager-api`).

---

## 1. Prerequisites

- Azure subscription
- Azure PostgreSQL server already created (e.g. `buildingsmanager-db.postgres.database.azure.com`)
- GitHub repo connected to Azure (for GitHub Actions) or Azure CLI for manual deploy

---

## 2. Backend – Azure App Service (Python)

### 2.1 Create the Web App (one-time)

**Azure Portal:**

1. Create **Resource group** (e.g. `rg-buildingsmanager`, region: **Israel Central**).
2. **App Service** → Create:
   - **Name:** `buildingsmanager-api` (or your choice; must be unique).
   - **Runtime:** Python 3.11.
   - **Region:** Israel Central.
   - **Plan:** Linux, Basic B1 or higher.
3. After creation: **Configuration** → **Application settings** → add:

   | Name            | Value (example) | Secret |
   |-----------------|-----------------|--------|
   | `PGHOST`        | `buildingsmanager-db.postgres.database.azure.com` | No  |
   | `PGUSER`        | `dbadmin`       | No  |
   | `PGPORT`        | `5432`          | No  |
   | `PGDATABASE`    | `postgres`      | No  |
   | `PGPASSWORD`    | *(your DB password)* | Yes |
   | `PGSSLMODE`     | `require` (for Azure PostgreSQL) | No  |
   | `SECRET_KEY`    | *(e.g. `openssl rand -hex 32`)* | Yes |
   | `ALLOWED_ORIGINS` | `https://<your-static-app>.azurestaticapps.net` | No  |
   | `ENVIRONMENT`   | `production`    | No  |
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | No  |
   | *(optional)* `AZURE_STORAGE_CONNECTION_STRING` | *(for file uploads)* | Yes |
   | *(optional)* `AZURE_STORAGE_CONTAINER_NAME` | `assetflow-files` | No  |

4. **Configuration** → **General settings**:
   - **Startup Command:**  
     `gunicorn --chdir /home/site/wwwroot app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000`  
     (The `--chdir` is required so the `app` package is found on Azure.)
5. **Save** and restart the app.

**Azure CLI (alternative):**

```bash
RESOURCE_GROUP=rg-buildingsmanager
LOCATION=israelcentral
APP_NAME=buildingsmanager-api
PLAN_NAME=plan-buildingsmanager

az group create --name $RESOURCE_GROUP --location $LOCATION
az appservice plan create --name $PLAN_NAME --resource-group $RESOURCE_GROUP --is-linux --sku B1
az webapp create --name $APP_NAME --resource-group $RESOURCE_GROUP --plan $PLAN_NAME --runtime "PYTHON:3.11"
az webapp config set --name $APP_NAME --resource-group $RESOURCE_GROUP --startup-file "gunicorn --chdir /home/site/wwwroot app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000"
# Then add app settings (PGHOST, PGUSER, PGPASSWORD, SECRET_KEY, ALLOWED_ORIGINS, etc.) in Portal or via az webapp config appsettings set
```

### 2.2 Deploy backend (GitHub Actions)

1. In Azure Portal: open your **App Service** → **Deployment Center** → **Manage publish profile** → **Download**.
2. In **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions**:
   - **New repository secret**
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND`
   - Value: entire contents of the downloaded publish profile (.PublishSettings) file.
3. In `.github/workflows/azure-backend.yml`, set `AZURE_WEBAPP_NAME` to your app name (e.g. `buildingsmanager-api`).
4. Push to `main` (with changes under `backend/`) or run the workflow manually; it will zip and deploy the backend (no Docker).

### 2.3 Deploy backend (manual, no Docker)

From repo root:

```bash
cd backend
pip install -r requirements.txt
zip -r ../backend.zip . -x "venv/*" -x "__pycache__/*" -x ".env"
cd ..
az webapp deploy --name buildingsmanager-api --resource-group rg-buildingsmanager --src-path backend.zip --type zip
```

Ensure app settings (PGHOST, PGUSER, PGPASSWORD, SECRET_KEY, ALLOWED_ORIGINS) are set as in 2.1.

---

## 3. Frontend – Azure Static Web Apps

### 3.1 Create Static Web App (one-time)

1. **Azure Portal** → **Static Web App** → Create:
   - **Name:** e.g. `buildingsmanager-app`
   - **Region:** Israel Central (or closest).
   - **Source:** GitHub; authorize and select repo and branch (`main`).
   - **Build details:**
     - Build preset: **Custom**.
     - App location: `/`
     - Output location: `dist`
     - (Optional) Add build env var: `VITE_API_URL` = `https://buildingsmanager-api.azurewebsites.net/api`
2. After creation, go to the resource → **Manage deployment token**; copy the token.

### 3.2 GitHub secret for frontend deploy

- **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions**:
  - **New repository secret**
  - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
  - Value: deployment token from the Static Web App.

Optional: set **Variables** → `VITE_API_URL` = `https://<your-backend-app>.azurewebsites.net/api` so the frontend build points to your API (no Docker).

### 3.3 Deploy frontend

- Push to `main` (with frontend changes) or run **Deploy Frontend to Azure** workflow; it runs `npm run build` (with `VITE_API_URL`) and deploys `dist/` to Static Web Apps (no Docker).

---

## 4. Checklist

- [ ] Resource group in Israel Central (or chosen region).
- [ ] Azure PostgreSQL allowed to accept connections from App Service (firewall / VNet if used).
- [ ] App Service: Python 3.11, startup command (gunicorn), app settings (PGHOST, PGUSER, PGPASSWORD, PGSSLMODE, SECRET_KEY, ALLOWED_ORIGINS; optional: AZURE_STORAGE_*).
- [ ] GitHub secret `AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND` for backend deploy.
- [ ] GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN` for frontend deploy.
- [ ] Variable or secret `VITE_API_URL` for frontend build (API URL including `/api`).
- [ ] ALLOWED_ORIGINS on backend includes the Static Web App URL (e.g. `https://*.azurestaticapps.net` or your exact URL).

---

## 5. URLs after deploy

- **Frontend:** `https://<your-static-web-app>.azurestaticapps.net`
- **Backend API:** `https://<your-app-name>.azurewebsites.net`
  - Health: `https://<your-app-name>.azurewebsites.net/health`
  - Docs: `https://<your-app-name>.azurewebsites.net/docs`

No Docker images or containers are used; backend runs on the built-in Python runtime and frontend is served as static files from Azure Static Web Apps.

---

## Custom domain (wavelync.com)

To use **www.wavelync.com** for the app and **www.wavelync.com/api** for the API, see **[CUSTOM_DOMAIN_WAVELYNC.md](CUSTOM_DOMAIN_WAVELYNC.md)** for DNS records, SSL, and CORS.

---

## 6. Optional: Create backend with Bicep

The Bicep template in `deploy/bicep/main.bicep` creates the App Service plan and Web App and sets app settings (PGHOST, PGUSER, PGPASSWORD, PGSSLMODE, SECRET_KEY, ALLOWED_ORIGINS, optional Azure Storage). Do not commit real secrets in `parameters.json`; pass them on the command line.

From repo root:

```bash
az group create --name rg-buildingsmanager --location israelcentral
az deployment group create --resource-group rg-buildingsmanager \
  --template-file deploy/bicep/main.bicep \
  --parameters deploy/bicep/parameters.json \
  --parameters dbPassword='YOUR_DB_PASSWORD' secretKey='YOUR_JWT_SECRET'
```

Optional: to enable file uploads, create a Storage Account and container, then pass:
`--parameters azureStorageConnectionString='DefaultEndpointsProtocol=https;...'`

Then deploy code via GitHub Actions or `az webapp deploy` (see 2.2 and 2.3).
