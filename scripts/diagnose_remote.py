"""Diagnose remote server: nginx, backend, certs, API. Run: python scripts/diagnose_remote.py"""
import paramiko
import os

HOST = os.environ.get("DEPLOY_HOST", "185.229.226.37")
USER = os.environ.get("DEPLOY_USER", "asset_flow")
PASS = os.environ.get("DEPLOY_PASSWORD", "KortexDigital1342#")

def run(c, cmd):
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out.strip(), err.strip()

def main():
    print("Connecting to", HOST, "...")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS)
    try:
        # 1. Service status
        print("\n=== Services ===")
        out, _ = run(c, "for s in postgresql nginx assetflow-backend; do echo -n \"$s: \"; systemctl is-active $s 2>/dev/null; done")
        print(out.encode("ascii", errors="replace").decode())
        # 2. Certs
        print("\n=== SSL certs ===")
        out, _ = run(c, "ls -la /etc/letsencrypt/live/wavelync.com/ 2>/dev/null || echo 'No certs found'")
        print(out.encode("ascii", errors="replace").decode())
        # 3. Nginx config
        print("\n=== Nginx config (listen) ===")
        out, _ = run(c, "grep -E 'listen|server_name' /etc/nginx/sites-enabled/buildingsmanager 2>/dev/null | head -20")
        print(out.encode("ascii", errors="replace").decode())
        # 4. Local API test
        print("\n=== API health (localhost) ===")
        out, _ = run(c, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/health 2>/dev/null || echo 'failed'")
        print("Backend health:", out)
        # 5. Nginx proxy
        print("\n=== Nginx /api (localhost) ===")
        out, _ = run(c, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health 2>/dev/null || echo 'failed'")
        print("API via nginx:", out)
        # 6. Backend logs (last 20 lines)
        print("\n=== Backend log (last 20 lines) ===")
        out, _ = run(c, "sudo journalctl -u assetflow-backend -n 20 --no-pager 2>/dev/null")
        print(out.encode("ascii", errors="replace").decode())
    finally:
        c.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
