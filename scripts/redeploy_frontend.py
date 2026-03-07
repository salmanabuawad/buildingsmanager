"""Redeploy frontend to production server. Run: python scripts/redeploy_frontend.py"""
import paramiko
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "185.229.226.37"
USER = "asset_flow"
PASS = "KortexDigital1342#"
WEB_ROOT = "/var/www/buildingsmanager"

def main():
    # Create tarball of dist
    import tarfile
    tmp = os.path.join(REPO, "dist_deploy.tar.gz")
    with tarfile.open(tmp, "w:gz") as tf:
        tf.add(os.path.join(REPO, "dist"), arcname="dist")
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(HOST, username=USER, password=PASS)
        sftp = c.open_sftp()
        sftp.put(tmp, "/tmp/dist_deploy.tar.gz")
        sftp.close()
        stdin, stdout, stderr = c.exec_command(f"cd /tmp && tar xzf dist_deploy.tar.gz && sudo cp -r dist/* {WEB_ROOT}/ && rm -rf dist dist_deploy.tar.gz")
        stdout.channel.recv_exit_status()
        err = stderr.read().decode()
        if err:
            print("Remote stderr:", err)
        print("Deployed to", WEB_ROOT)
        c.close()
    finally:
        os.unlink(tmp)

if __name__ == "__main__":
    main()
