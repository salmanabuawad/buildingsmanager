"""Disable HTTPS, keep HTTP only on remote server. Run: python scripts/disable_https_remote.py"""
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
    sftp = c.open_sftp()
    sftp.put(os.path.join(REPO, "nginx", "nginx-http-only.conf"), "/tmp/nginx-http.conf")
    sftp.close()
    c.exec_command("sudo cp /tmp/nginx-http.conf /etc/nginx/sites-available/buildingsmanager")
    c.exec_command("sudo nginx -t && sudo systemctl reload nginx")
    c.exec_command("sudo sed -i 's|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,http://185.229.226.37|' /home/asset_flow/buildingsmanager/backend/.env")
    c.exec_command("sudo systemctl restart assetflow-backend")
    c.close()
    print("HTTPS disabled. Use http://185.229.226.37/")

if __name__ == "__main__":
    main()
