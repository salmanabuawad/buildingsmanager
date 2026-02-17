# VM Deployment (nginx + FastAPI) – Israel Central

Deploy AssetFlow to an Azure Linux VM with **nginx** as reverse proxy and **gunicorn** for the FastAPI backend.

---

## 1. Create the VM

### 1.1 Prerequisites

- Azure CLI (`az login`)
- Resource group `rg-buildingsmanager` (Israel Central)
- SSH public key
- Quota for Standard_D2as_v5 in Israel Central (request in Azure Portal if needed)

### 1.2 Deploy VM

```powershell
# Set your SSH public key (or edit deploy/bicep/vm-parameters.json)
$env:VM_SSH_PUBLIC_KEY = (Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub" -Raw)

# Create VM
.\deploy\create-vm.ps1
```

Output will show the SSH connection string, e.g. `ssh azureuser@<IP>`.

---

## 2. Initial VM Setup (one-time)

SSH into the VM and install nginx, Python, and dependencies:

```bash
ssh azureuser@<VM_IP>

# Install
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv nginx
```

---

## 3. Deploy Application

From your local repo (Windows):

```powershell
# Set VM host (IP from create-vm.ps1 output)
$env:VM_HOST = "azureuser@<VM_IP>"
.\deploy\deploy-to-vm.ps1
```

Then on the VM:

```bash
# Copy files into place
sudo mkdir -p /var/www/assetflow
sudo cp -r /tmp/assetflow-deploy/backend /var/www/assetflow/
sudo cp -r /tmp/assetflow-deploy/static /var/www/assetflow/
sudo cp -r /tmp/assetflow-deploy/deploy /var/www/assetflow/

# Nginx config
sudo cp /var/www/assetflow/deploy/nginx/assetflow.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/assetflow.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Create .env
sudo nano /var/www/assetflow/.env
# Add:
# PGHOST=buildingsmanager-db.postgres.database.azure.com
# PGUSER=dbadmin
# PGPORT=5432
# PGDATABASE=postgres
# PGPASSWORD=<your-password>
# SECRET_KEY=<openssl rand -hex 32>
# ENVIRONMENT=production
# ALLOWED_ORIGINS=*

# Python venv and deps
sudo python3 -m venv /var/www/assetflow/venv
sudo /var/www/assetflow/venv/bin/pip install -r /var/www/assetflow/backend/requirements.txt

# Gunicorn service
sudo cp /var/www/assetflow/deploy/vm/gunicorn.service /etc/systemd/system/
sudo chown -R www-data:www-data /var/www/assetflow
sudo chmod 600 /var/www/assetflow/.env
sudo systemctl daemon-reload
sudo systemctl enable gunicorn
sudo systemctl start gunicorn

# Start nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Verify

- SPA: http://\<VM_IP\>/
- API: http://\<VM_IP\>/api/
- Health: http://\<VM_IP\>/health

---

## 5. PostgreSQL Firewall

In Azure Portal, add the VM’s public IP to the PostgreSQL server firewall.

---

## 6. SSL (optional)

Use Let’s Encrypt with certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
