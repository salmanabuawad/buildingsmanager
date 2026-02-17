# Custom domain: wavelync.com

Use **www.wavelync.com** for the app and **www.wavelync.com/api** for the API (same host). Optionally **wavelync.com** (root) redirects to www.

---

## 1. DNS records (at your domain registrar)

Add these records where **wavelync.com** is managed (GoDaddy, Cloudflare, Azure DNS, etc.):

| Type  | Name / Host     | Value / Target                              | TTL  |
|-------|-----------------|---------------------------------------------|------|
| **CNAME** | **www**         | **buildingsmanager-api.azurewebsites.net** (combined: app + **www.wavelync.com/api**) | 3600 |
| **CNAME** / **ALIAS** | **@** (root) | **buildingsmanager-api.azurewebsites.net** or redirect to www | 3600 |

- **www.wavelync.com** → App Service (app at `/`, API at **/api**).  
- **wavelync.com** → same App Service or redirect to **www.wavelync.com**.

---

## 2. Backend and app on same host (www.wavelync.com + www.wavelync.com/api)

The API is at **https://www.wavelync.com/api** (not api.wavelync.com). Same App Service serves the SPA and the API.

### CORS

In **Configuration** → **Application settings**, set **ALLOWED_ORIGINS** to include:

```
https://wavelync.com,https://www.wavelync.com,https://buildingsmanager-app.azurestaticapps.net
```

### SSL (HTTPS)

In **App Service** → **Custom domains** → add **www.wavelync.com** (and **wavelync.com** if used). Bind an App Service Managed Certificate for each.

---

## 3. Frontend only: wavelync.com (Static Web App)

1. **Static Web App** → **Custom domains** → **Add** → add **wavelync.com** and **www.wavelync.com**.  
2. Use the **CNAME target** Azure shows for **www** and (if supported) **@** at your DNS provider.  
3. Add the TLS binding (Azure managed cert) in **Custom domains**.

---

## 4. Deploy combined: www.wavelync.com and www.wavelync.com/api

To serve both the app and the API from **www.wavelync.com** (API at **www.wavelync.com/api**):

1. **Deploy combined** (frontend packed into backend, one App Service):
   ```powershell
   $env:DEPLOY_COMBINED = "1"
   .\deploy\run-deploy.ps1
   ```
   This builds the frontend with **VITE_API_URL=/api**, copies `dist/` into `backend/static/`, and deploys the backend. The same App Service serves the SPA at `/` and the API at `/api`.

2. **Point www.wavelync.com to the App Service**  
   At your DNS provider:
   - **CNAME** **www** → **buildingsmanager-api.azurewebsites.net**  
   - **CNAME** / **ALIAS** **@** (root) → **buildingsmanager-api.azurewebsites.net** or redirect to www  
   - For **custom domain verification**, add the **TXT** records Azure shows:
     - **asuid.wavelync.com** → *(value from Portal)*  
     - **asuid.www.wavelync.com** → *(value from Portal)*  

3. **Add custom domain in Azure**  
   **App Service** → **Custom domains** → **Add custom domain** → **www.wavelync.com** (and **wavelync.com** if needed). Validate and bind SSL.

Then:
- **https://www.wavelync.com** → app  
- **https://www.wavelync.com/api** → API (e.g. **https://www.wavelync.com/api/health**, **https://www.wavelync.com/api/auth/login**)

## 5. Separate frontend: point the app to the API

If you host the frontend elsewhere (e.g. Static Web App), set **VITE_API_URL** to **https://www.wavelync.com/api** (not api.wavelync.com), then redeploy the frontend.

---

## 6. Checklist

- [ ] **Same host (www.wavelync.com + www.wavelync.com/api):** Deploy with `DEPLOY_COMBINED=1`; DNS **www** → App Service; add custom domain and SSL.  
- [ ] ALLOWED_ORIGINS includes **https://wavelync.com** and **https://www.wavelync.com**.  
- [ ] **VITE_API_URL** = **/api** (combined) or **https://www.wavelync.com/api** (separate frontend).
