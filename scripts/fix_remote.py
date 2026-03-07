"""Fix remote server: bcrypt, verify API, enable HTTPS. Run: python scripts/fix_remote.py"""
import paramiko
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = os.environ.get("DEPLOY_HOST", "185.229.226.37")
USER = os.environ.get("DEPLOY_USER", "asset_flow")
PASS = os.environ.get("DEPLOY_PASSWORD", "KortexDigital1342#")

def main():
    print("Connecting to", HOST, "...")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS)
    try:
        # 1. Fix bcrypt (passlib compatibility)
        print("\n[1/3] Fixing bcrypt for passlib...")
        stdin, stdout, stderr = c.exec_command(
            "cd ~/buildingsmanager/backend && source venv/bin/activate && pip install 'bcrypt==4.0.1' -q && echo 'bcrypt fixed'"
        )
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        print(out.encode("ascii", errors="replace").decode())
        if err and "ERROR" in err:
            print("STDERR:", err.encode("ascii", errors="replace").decode())

        # 2. Restart backend
        print("\n[2/3] Restarting backend...")
        stdin, stdout, stderr = c.exec_command("sudo systemctl restart assetflow-backend")
        stdout.channel.recv_exit_status()
        print("Backend restarted.")

        # 3. Enable HTTPS (certbot) if certs missing
        print("\n[3/3] Checking HTTPS...")
        stdin, stdout, stderr = c.exec_command("test -f /etc/letsencrypt/live/wavelync.com/fullchain.pem && echo 'HTTPS_OK' || echo 'HTTPS_MISSING'")
        has_certs = "HTTPS_OK" in stdout.read().decode()
        if not has_certs:
            print("SSL certs missing. Running enable_https_wavelync.py...")
            c.close()
            import subprocess
            r = subprocess.run([sys.executable, os.path.join(REPO, "scripts", "enable_https_wavelync.py")])
            if r.returncode != 0:
                print("HTTPS setup may have failed. Check DNS: wavelync.com must point to", HOST)
            return
        print("HTTPS certs exist.")

        # Verify API
        print("\n=== Verify API ===")
        stdin, stdout, stderr = c.exec_command("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/buildings 2>/dev/null || echo 'fail'")
        code = stdout.read().decode().strip()
        print("GET /api/buildings:", code, "(401=auth required, 200=ok)")
    finally:
        c.close()
    print("\nDone. Try https://wavelync.com or http://" + HOST + "/")

if __name__ == "__main__":
    main()
