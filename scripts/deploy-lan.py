#!/usr/bin/env python3
"""
Deploy Buildings Manager to LAN server at 10.25.236.179 using paramiko.
Equivalent to deploy-lan.sh but works in non-TTY environments.
"""
import os, sys, tarfile, tempfile, subprocess, paramiko, time
from pathlib import Path

REMOTE_HOST = "10.25.236.179"
REMOTE_USER = "BenyK"
REMOTE_PASS = "BenyK"
APP_DIR     = "/home/BenyK/buildingsmanager"
WEB_ROOT    = "/var/www/buildingsmanager"
SERVICE     = "buildingsmanager-lan.service"

ROOT = Path(__file__).resolve().parent.parent  # repo root

def ssh_connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(REMOTE_HOST, username=REMOTE_USER, password=REMOTE_PASS,
                   look_for_keys=False, allow_agent=False, timeout=30)
    return client

def run(client, cmd, check=True):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    rc  = stdout.channel.recv_exit_status()
    if out.strip(): print(out.strip())
    if err.strip(): print(err.strip(), file=sys.stderr)
    if check and rc != 0:
        raise RuntimeError(f"Remote command failed (rc={rc}): {cmd}")
    return rc, out, err

def sudo_run(client, cmd):
    return run(client, f"echo {REMOTE_PASS} | sudo -S {cmd}")

print("==============================")
print(f"  LAN deploy -> {REMOTE_HOST}")
print("==============================")

# 1) Build frontend locally
print("[1/4] Building frontend...")
result = subprocess.run(["npm.cmd", "run", "build"], cwd=ROOT, capture_output=True, text=True, shell=False)
last = "\n".join(result.stdout.strip().splitlines()[-3:])
print(last)
if result.returncode != 0:
    print(result.stderr[-500:], file=sys.stderr)
    sys.exit(1)

# 2) Package and upload
print("[2/4] Packaging and uploading...")
tmp = tempfile.mktemp(suffix=".tar.gz")
with tarfile.open(tmp, "w:gz") as tar:
    tar.add(ROOT / "dist",                      arcname="dist")
    tar.add(ROOT / "backend" / "app",           arcname="backend/app")
    tar.add(ROOT / "backend" / "requirements.txt", arcname="backend/requirements.txt")

ssh = ssh_connect()
sftp = ssh.open_sftp()
remote_tar = f"/home/{REMOTE_USER}/bm-lan-latest.tar.gz"
sftp.put(tmp, remote_tar)
sftp.close()
os.unlink(tmp)
print(f"  Uploaded {remote_tar}")

# 3) Extract and deploy on server
print("[3/4] Deploying on server...")
run(ssh, f"""
set -e
mkdir -p /tmp/bm-deploy-tmp
tar -xzf {remote_tar} -C /tmp/bm-deploy-tmp
cp -r /tmp/bm-deploy-tmp/backend/app/. {APP_DIR}/backend/app/
rm -rf /tmp/bm-deploy-tmp
""")
sudo_run(ssh, f"bash -c 'cp -r /tmp/bm-deploy-tmp/dist/. {WEB_ROOT}/ 2>/dev/null; true'")
# Deploy frontend via sudo
run(ssh, f"""
set -e
mkdir -p /tmp/bm-fe-tmp
tar -xzf {remote_tar} -C /tmp/bm-fe-tmp
echo {REMOTE_PASS} | sudo -S cp -r /tmp/bm-fe-tmp/dist/. {WEB_ROOT}/
echo {REMOTE_PASS} | sudo -S chown -R nginx:nginx {WEB_ROOT} 2>/dev/null || true
rm -rf /tmp/bm-fe-tmp
""")

# 4) Restart service
print(f"[4/4] Restarting {SERVICE}...")
sudo_run(ssh, f"systemctl restart {SERVICE}")
time.sleep(3)
rc, out, _ = run(ssh, f"systemctl is-active {SERVICE}", check=False)
print(f"  Service status: {out.strip()}")

ssh.close()

print("")
print("==============================")
print(f"  http://{REMOTE_HOST}/")
print("==============================")
