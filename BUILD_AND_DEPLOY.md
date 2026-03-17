# Build and Deploy

Summary of how the frontend is built and deployed in this project.

---

## Build

- **Command:** `npm run build` → runs `vite build`
- **Config:** `vite.config.ts` (React, base `/`, Supabase env baked in via `define`)
- **Output:** `dist/` (static assets: `index.html`, hashed JS/CSS, assets)
- **Env at build time:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from `.env` or `netlify.toml`)

```bash
npm run build
```

---

## Deploy options

### 1. Remote server (SSH/SCP)

- **Script:** `deploy-to-server.ps1`
- **One-liner:** `npm run deploy:server` (builds then runs the script)

**Flow:**

1. Run `npm run build` (creates `dist/`).
2. `scp -r dist USER@SERVER:/tmp/buildingsmanager_deploy`
3. SSH: `mkdir -p REMOTE_PATH && rm -rf REMOTE_PATH/* && mv /tmp/.../dist/* REMOTE_PATH/ && rm -rf /tmp/...`

**Defaults:**

| What       | Default              | Override (env)   |
|-----------|----------------------|------------------|
| Server    | `185.229.226.37`     | (hardcoded; change script for other hosts) |
| User      | `root`               | `DEPLOY_USER`    |
| Remote dir| `/var/www/html`      | `DEPLOY_PATH`    |

**Auth:** SSH key to `USER@SERVER`. Script does not use `DEPLOY_SSH_PASS`; use PuTTY/plink if you need password auth.

**Docs:** `DEPLOY_SERVER.md`

---

### 2. Netlify

- **Commands:**  
  - Production: `npm run deploy` → `npm run build && netlify deploy --prod`  
  - Preview: `npm run deploy:preview` → `npm run build && netlify deploy`
- **Config:** `netlify.toml`  
  - Build: `npx vite build`  
  - Publish: `dist`  
  - Env: `VITE_SUPABASE_*`, `SUPABASE_*` for functions  
  - Redirects: `/api/email/*` → Netlify functions; `/*` → `/index.html` (SPA)
- **Site:** https://buildingmanager.bolt.host/

**CLI:** `netlify deploy --prod` or interactive `./deploy.sh` (bash).

---

### 3. Other static hosts

- Build once: `npm run build`
- Upload `dist/` to Vercel, S3, DigitalOcean, or any static host.
- **Important:** Serve `index.html` for all routes (SPA). Root is `base: '/'` in Vite.

See `DEPLOYMENT_GUIDE.md` for Vercel, S3, Docker, etc.

---

## Quick reference

| Goal              | Command / action                          |
|------------------|--------------------------------------------|
| Build only       | `npm run build`                            |
| Deploy to server | `npm run deploy:server` or `.\deploy-to-server.ps1` |
| Deploy Netlify   | `npm run deploy` (prod) or `npm run deploy:preview` |
| Preview build    | `npm run preview` (local)                  |
