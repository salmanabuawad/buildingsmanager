"""Enable HTTPS for wavelync.com and www.wavelync.com via Let's Encrypt.
Requires DNS: wavelync.com and www.wavelync.com must point to 185.229.226.37
Run: python scripts/enable_https_wavelync.py"""
import paramiko
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = os.environ.get("DEPLOY_HOST", "185.229.226.37")
USER = os.environ.get("DEPLOY_USER", "asset_flow")
PASS = os.environ.get("DEPLOY_PASSWORD", "KortexDigital1342#")

def main():
    print("Connecting to server...")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS)

    # 1. Upload nginx config with domain names
    local_conf = os.path.join(REPO, "nginx", "nginx-wavelync-http.conf")
    sftp = c.open_sftp()
    sftp.put(local_conf, "/tmp/nginx-wavelync.conf")
    sftp.close()

    # 2. Install config
    print("Updating nginx config...")
    stdin, stdout, stderr = c.exec_command("sudo cp /tmp/nginx-wavelync.conf /etc/nginx/sites-available/buildingsmanager")
    stdout.channel.recv_exit_status()

    # 3. Reload nginx
    stdin, stdout, stderr = c.exec_command("sudo nginx -t 2>&1 && sudo systemctl reload nginx")
    out = (stdout.read() + stderr.read()).decode()
    if "syntax is ok" not in out and "successful" not in out:
        print("Nginx reload warning:", out)

    # 4. Install certbot if needed
    print("Installing certbot...")
    stdin, stdout, stderr = c.exec_command(
        "sudo apt-get update -qq && sudo apt-get install -y certbot python3-certbot-nginx 2>&1"
    )
    stdout.channel.recv_exit_status()

    # 5. Run certbot for wavelync.com and www.wavelync.com
    print("Obtaining SSL certificate (wavelync.com, www.wavelync.com)...")
    cmd = (
        "sudo certbot --nginx -d wavelync.com -d www.wavelync.com "
        "--non-interactive --agree-tos --register-unsafely-without-email --expand 2>&1"
    )
    stdin, stdout, stderr = c.exec_command(cmd)
    cert_out = (stdout.read() + stderr.read()).decode()
    exit_code = stdout.channel.recv_exit_status()

    if exit_code != 0:
        print("Certbot failed:", cert_out, file=sys.stderr)
        print("\nEnsure wavelync.com and www.wavelync.com DNS point to", HOST, file=sys.stderr)
        c.close()
        sys.exit(1)

    print("Certificate obtained successfully.")

    # 6. Update backend ALLOWED_ORIGINS
    origins = "http://localhost,http://127.0.0.1,http://185.229.226.37,https://185.229.226.37,https://wavelync.com,https://www.wavelync.com,http://wavelync.com,http://www.wavelync.com"
    c.exec_command(
        f"sudo sed -i 's|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS={origins}|' /home/asset_flow/buildingsmanager/backend/.env 2>/dev/null || true"
    )

    # 7. Restart backend
    c.exec_command("sudo systemctl restart assetflow-backend")

    c.close()
    print("HTTPS enabled. Use https://wavelync.com and https://www.wavelync.com")

if __name__ == "__main__":
    main()
