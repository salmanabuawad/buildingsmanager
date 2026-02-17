# SSL for wavelync.com (HTTPS)

## Step 1: Add DNS record at Hostinger

`wavelync.com` DNS is managed at **Hostinger**. Add this record:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **A** | **app** | **20.217.184.238** | 3600 |

That makes `app.wavelync.com` resolve to your VM.

**Where:** Hostinger → Domains → wavelync.com → DNS Zone / Manage DNS → Add Record.

---

## Step 2: Wait for DNS propagation

Wait 5–15 minutes, then check:

```powershell
nslookup app.wavelync.com
# Should return 20.217.184.238
```

---

## Step 3: Run Certbot on the VM

After DNS resolves correctly:

```powershell
ssh azureuser@20.217.184.238 "sudo /var/www/assetflow/deploy/vm/enable-ssl.sh"
```

Or manually:

```powershell
ssh azureuser@20.217.184.238 "sudo certbot --nginx -d app.wavelync.com --non-interactive --agree-tos --register-unsafely-without-email --redirect"
```

Certbot will obtain an SSL certificate and configure nginx for HTTPS with redirect from HTTP.

---

## Step 4: Open your app

Use:

- **https://app.wavelync.com** (secure)

The "Not secure" warning will disappear once SSL is active.
