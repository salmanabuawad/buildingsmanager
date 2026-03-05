#!/usr/bin/env python3
"""
Remote deployment runner - uploads project and runs deploy script on Ubuntu server.
Usage:
  python scripts/run_deploy_remote.py
  # Or with env vars:
  DEPLOY_HOST=185.229.226.37 DEPLOY_USER=asset_flow DEPLOY_PASSWORD=xxx python scripts/run_deploy_remote.py
"""
import os
import sys
import subprocess
import tarfile
import tempfile
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXCLUDE = {
    "node_modules",
    "backend/venv",
    "backend/__pycache__",
    ".git",
    "dist",
    "*.pyc",
    "__pycache__",
}


def _filter_members(tarinfo):
    """Exclude large/unnecessary dirs from tarball."""
    parts = Path(tarinfo.name).parts
    for excl in EXCLUDE:
        if excl.startswith("*"):
            if tarinfo.name.endswith(excl[1:]):
                return None
        elif excl in parts or any(excl in p for p in parts):
            return None
    return tarinfo


def create_tarball() -> str:
    """Create tarball of project, excluding large dirs."""
    tmp = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False)
    tmp.close()
    with tarfile.open(tmp.name, "w:gz") as tf:
        tf.add(REPO_ROOT, arcname="buildingsmanager", filter=_filter_members)
    return tmp.name


def main():
    host = os.environ.get("DEPLOY_HOST", "185.229.226.37")
    user = os.environ.get("DEPLOY_USER", "asset_flow")
    password = os.environ.get("DEPLOY_PASSWORD", "KortexDigital1342#")
    db_password = os.environ.get("DB_PASSWORD", password)  # Use same as SSH for simplicity

    try:
        import paramiko
    except ImportError:
        print("Installing paramiko for SSH...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
        import paramiko

    print(f"Creating project archive (excluding node_modules, venv, .git)...")
    tarball = create_tarball()
    try:
        print(f"Connecting to {user}@{host}...")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(host, username=user, password=password, timeout=30)

        sftp = client.open_sftp()
        remote_tarball = f"/tmp/buildingsmanager_{os.getpid()}.tar.gz"
        print("Uploading archive...")
        sftp.put(tarball, remote_tarball)
        sftp.close()

        # Extract and run deploy (tarball has buildingsmanager/ as root)
        # Fix CRLF line endings from Windows before running bash scripts
        safe_pass = db_password.replace("'", "'\"'\"'")
        sudo_pass = password.replace("'", "'\"'\"'")
        # Grant passwordless sudo for deploy (required for apt, nginx, systemd)
        cmd = f"""
cd ~ && rm -rf buildingsmanager && tar xzf {remote_tarball} && rm {remote_tarball} && cd buildingsmanager
find . -name "*.sh" -exec sed -i 's/\\r$//' {{}} \\;
chmod +x scripts/deploy-production-ubuntu.sh standalone/apply_migrations.sh
echo '{sudo_pass}' | sudo -S bash -c 'echo "asset_flow ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/asset_flow && chmod 440 /etc/sudoers.d/asset_flow'
export PGPASSWORD='{safe_pass}' DB_PASSWORD='{safe_pass}'
nohup ./scripts/deploy-production-ubuntu.sh > ~/deploy.log 2>&1 &
echo "Deploy started in background. PID: $!"
sleep 3
tail -30 ~/deploy.log
"""
        print("Running deployment on server (background)...")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(out)
        if err:
            print("STDERR:", err, file=sys.stderr)
        client.close()
        print("\nDeployment running in background on server.")
        print("Monitor: ssh asset_flow@185.229.226.37 'tail -f ~/deploy.log'")
        print("App URL (when done): http://185.229.226.37/")
    finally:
        os.unlink(tarball)


if __name__ == "__main__":
    main()
