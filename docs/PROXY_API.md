# Proxy /api to the backend

The app uses **same-origin API only**: all requests go to `http://<host>/api/...`. You **must** proxy `/api` to the backend (FastAPI on port 8000). No proxy = 404 on any API call.

## Nginx (recommended when serving the built app)

Use the config in this repo so `/api` is proxied:

**Windows**

```powershell
# After deploy, apply Nginx config (proxies /api to 127.0.0.1:8000)
.\nginx\setup-nginx-config-windows.ps1
cd C:\nginx; .\nginx.exe -s reload
```

Config source: `nginx/nginx-windows.conf` — contains:

```nginx
upstream fastapi_backend {
    server 127.0.0.1:8000;
    keepalive 4;
}

location /api/ {
    proxy_pass http://fastapi_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
}
```

**Linux**

Copy `nginx/nginx.conf` to your Nginx sites (e.g. `/etc/nginx/sites-available/buildingsmanager`), set `root` to your build path, then `sudo nginx -t && sudo systemctl reload nginx`. See `nginx/README.md`.

## Vite preview (no Nginx)

For local testing of the built app with `http://localhost/api/...`:

```bash
# Terminal 1: backend
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: build + serve (Vite preview proxies /api to 8000)
npm run build && npm run preview
```

Open http://localhost/ — preview runs on port 80 and proxies `/api` to the backend.

## Summary

| How you serve the app | How /api is proxied to backend |
|-----------------------|---------------------------------|
| Nginx on port 80      | Use `nginx/nginx-windows.conf` (Windows) or `nginx/nginx.conf` (Linux). Run `.\nginx\setup-nginx-config-windows.ps1` then reload Nginx. |
| `npm run preview`     | Vite preview config in `vite.config.ts` already proxies `/api` to `http://localhost:8000`. |
| `npm run dev`         | Vite dev server proxies `/api` to the backend. |

Backend must always be running on **port 8000** for the proxy to work.

---

## Troubleshooting "Not Found" on /api/...

1. **Test if the proxy works**  
   Open **http://localhost/api/proxy-test** in the browser.  
   - If you see `{"proxy":"ok","message":"Request reached the backend"}` → the proxy works; the issue may be the specific route or method.  
   - If you get 404 → the server on port 80 is **not** proxying `/api` to the backend.

2. **If proxy-test 404s**  
   - Use Nginx: run `.\nginx\setup-nginx-config-windows.ps1`, then `cd C:\nginx; .\nginx.exe -s reload`. Ensure no other server (IIS, another Nginx, Vite on 80) is using port 80.  
   - Or use Vite preview: stop whatever is on port 80, then `npm run build && npm run preview` (preview proxies `/api` to 8000). Open http://localhost/

3. **Test the backend directly**  
   Open **http://localhost:8000/api/proxy-test**. If that works, the backend is fine; the problem is that port 80 is not forwarding to it.
