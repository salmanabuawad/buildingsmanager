# Email API – Backend must be deployed

The **Send test email** and other email features call the FastAPI backend at:

- `POST /api/email/test`
- `POST /api/email/send`

If you see **404** on `/api/email/test`, the host serving your app is only serving the **frontend** (static files). The **FastAPI backend** is not running there.

---

## Deploying with Bolt.new

[Bolt.new](https://bolt.new) only deploys the **frontend** (Vite/React). Per [Bolt's supported technologies](https://support.bolt.new/building/supported-technologies), **Bolt supports JavaScript-based backends only** — it does **not** run Python or FastAPI. So the `backend/` folder (FastAPI) is never deployed or run by Bolt.

To get the email API working when the app is published on Bolt:

### 1. Deploy the FastAPI backend somewhere else

Deploy the `backend/` app to a host that runs Python:

- **[Railway](https://railway.app)** – connect repo, set root to `backend/`, add env vars, deploy.
- **[Render](https://render.com)** – Web Service, build command (e.g. `pip install -r requirements.txt`), start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **[Fly.io](https://fly.io)** – `fly launch` in `backend/`, add a `Dockerfile` if needed.
- **Azure App Service** or another host – run `uvicorn app.main:app` and expose the app.

You will get a URL like `https://your-app-name.railway.app` or `https://your-app.onrender.com`.

### 2. Set the backend URL in your Bolt project

So the frontend calls your deployed API (not the same host as Bolt):

1. In your Bolt project, add a **`.env`** or **`.env.production`** in the **project root** (same level as `package.json`).
2. Add:
   ```
   VITE_BACKEND_URL=https://your-deployed-backend-url.com
   ```
   Use the real URL from step 1 (no trailing slash). Bolt loads `.env` at build time; Vite bakes `VITE_*` into the client bundle.
3. **Save** and **Publish** again so Bolt rebuilds and redeploys with the new env.

After that, "Send test email" will call `https://your-deployed-backend-url.com/api/email/test` instead of your Bolt URL.

### 3. Backend requirements

- The backend needs its own `.env` (e.g. `DATABASE_URL`, `SECRET_KEY`, etc.) configured on the host (Railway/Render/Fly dashboard or env vars).
- For email only, the backend just needs to run the FastAPI app; the frontend sends `email_config` (from Supabase) in the request body, so no DB is required on the backend just for sending test email (unless you use it for other APIs too).

### Quick check

- `https://YOUR_BACKEND_URL/health` should return `{"status":"healthy"}`.
- Then try "Send test email" in the app; it should hit your deployed backend.

---

## What to do (non-Bolt)

1. **Deploy the backend** so it is reachable at a URL (same host or different).
   - Backend code: `backend/` (FastAPI).
   - Run it with: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (from the `backend` directory, with `.env` set).

2. **Point the frontend at that URL**
   - If the backend is at `https://profilegroup.bolt.host`: ensure the **same** server runs FastAPI and handles `/api/*` (not only static files).
   - If the backend is elsewhere (e.g. `https://your-api.example.com`), set in your build/env:
     - `VITE_BACKEND_URL=https://your-api.example.com`
   Then rebuild and redeploy the frontend.

3. **Check the backend**
   - Open `https://YOUR_BACKEND_URL/health` – should return `{"status":"healthy"}`.
   - Open `https://YOUR_BACKEND_URL/api/email/test` in the browser – 405 Method Not Allowed is OK (GET not allowed); 404 means the app or route is not mounted.

## Summary

- **Bolt.new** deploys only the frontend; deploy the FastAPI backend elsewhere and set `VITE_BACKEND_URL` in `.env` or `.env.production`, then re-publish.
- **404 on /api/email/test** = no FastAPI app at that URL; deploy `backend/` and point the frontend at it with `VITE_BACKEND_URL`.
