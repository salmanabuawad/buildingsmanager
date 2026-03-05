"""Enable HTTPS on remote Ubuntu server. Run: python scripts/enable_https_remote.py"""
import paramiko
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "185.229.226.37"
USER = "asset_flow"
PASS = "KortexDigital1342#"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS)

    # Upload nginx HTTPS config
    sftp = c.open_sftp()
    local_conf = os.path.join(REPO, "nginx", "nginx-https.conf")
    sftp.put(local_conf, "/tmp/nginx-https.conf")
    sftp.close()

    # Generate self-signed cert
    cmd = "sudo mkdir -p /etc/nginx/ssl && (test -f /etc/nginx/ssl/assetflow.crt || sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/assetflow.key -out /etc/nginx/ssl/assetflow.crt -subj '/CN=185.229.226.37/O=AssetFlow/C=IL')"
    c.exec_command(cmd)[1].read()

    # Install config and reload
    c.exec_command("sudo cp /tmp/nginx-https.conf /etc/nginx/sites-available/buildingsmanager")
    stdin, stdout, stderr = c.exec_command("sudo nginx -t 2>&1 && sudo systemctl reload nginx")
    out = stdout.read().decode() + stderr.read().decode()
    exit_code = stdout.channel.recv_exit_status()
    if exit_code == 0 or "syntax is ok" in out:
        print("HTTPS enabled. Use https://185.229.226.37/")
    else:
        print("Nginx:", out)

    # Update backend ALLOWED_ORIGINS
    c.exec_command("sudo sed -i 's|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,http://185.229.226.37,https://185.229.226.37|' /home/asset_flow/buildingsmanager/backend/.env")
    c.exec_command("sudo systemctl restart assetflow-backend")
    c.close()
    print("Done. Browser may show cert warning (self-signed) - click Advanced -> Proceed.")

if __name__ == "__main__":
    main()
