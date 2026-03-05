"""Start servers on remote production. Run: python scripts/start_servers_remote.py"""
import paramiko
import os

HOST = os.environ.get("DEPLOY_HOST", "185.229.226.37")
USER = os.environ.get("DEPLOY_USER", "asset_flow")
PASS = os.environ.get("DEPLOY_PASSWORD", "KortexDigital1342#")

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS)
    cmds = [
        "sudo systemctl start postgresql 2>/dev/null || true",
        "sudo systemctl start nginx 2>/dev/null || true",
        "sudo systemctl start assetflow-backend 2>/dev/null || sudo systemctl restart assetflow-backend",
    ]
    for cmd in cmds:
        stdin, stdout, stderr = c.exec_command(cmd)
        out = stdout.read().decode().strip()
        err = stderr.read().decode().strip()
        if out:
            print(out)
        if err and "Failed to start" not in err:
            print("STDERR:", err, file=__import__("sys").stderr)
    c.close()
    print("Servers started. App: https://wavelync.com")

if __name__ == "__main__":
    main()
