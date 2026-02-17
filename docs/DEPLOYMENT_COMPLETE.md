# AssetFlow VM Deployment – Complete

## Deployment Summary

| Component | Status | URL |
|-----------|--------|-----|
| **Static SPA** | Running | http://20.217.184.238/ |
| **API** | Running | http://20.217.184.238/api |
| **Health** | Healthy | http://20.217.184.238/health |
| **Gunicorn** | Active | 127.0.0.1:8000 |
| **Nginx** | Active | Port 80 |

---

## VM Details

- **IP:** 20.217.184.238
- **Location:** Israel Central
- **SSH:** `ssh azureuser@20.217.184.238`

---

## Pending: SSL (HTTPS)

DNS for `app.wavelync.com` must point to the VM before SSL works.

1. Add at Hostinger: **A** record `app` → `20.217.184.238`
2. Wait 5–15 min for propagation
3. Run: `ssh azureuser@20.217.184.238 "sudo /var/www/assetflow/deploy/vm/enable-ssl.sh"`
4. Access: **https://app.wavelync.com**

See [SSL_WAVELYNC.md](./SSL_WAVELYNC.md).

---

## Redeploy

```powershell
$env:VM_HOST = "azureuser@20.217.184.238"
.\deploy\deploy-to-vm.ps1
```

Then on the VM:

```bash
sudo cp -r /tmp/assetflow-deploy/backend /var/www/assetflow/
sudo cp -r /tmp/assetflow-deploy/static /var/www/assetflow/
sudo cp /tmp/assetflow-deploy/deploy/nginx/assetflow.conf /etc/nginx/sites-available/
sudo systemctl restart gunicorn
sudo nginx -t && sudo systemctl reload nginx
```
