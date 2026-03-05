"""Apply seed to remote production DB. Run: python scripts/apply_seed_remote.py"""
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

    # Upload scripts
    sftp = c.open_sftp()
    for script in ["seed_local_reference_data.py", "import_mcp_json_to_local.py"]:
        local = os.path.join(REPO, "scripts", script)
        if os.path.isfile(local):
            with open(local, "rb") as f:
                sftp.putfo(f, f"/home/asset_flow/buildingsmanager/scripts/{script}")
    sftp.close()

    # 1. Asset types (SQL)
    cmd = "cd ~/buildingsmanager && source backend/venv/bin/activate && python scripts/seed_local_reference_data.py"
    stdin, stdout, stderr = c.exec_command(cmd)
    print(stdout.read().decode())
    if stderr.read(): pass

    # 2. Full seed from JSON - upload fixed import script (handles action_id FK)
    sftp = c.open_sftp()
    sftp.put(os.path.join(REPO, "scripts", "import_mcp_json_to_local.py"), "/home/asset_flow/buildingsmanager/scripts/import_mcp_json_to_local.py")
    sftp.close()
    cmd = "cd ~/buildingsmanager && source backend/venv/bin/activate && python scripts/import_mcp_json_to_local.py"
    stdin, stdout, stderr = c.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("STDERR:", err)
    c.close()
    print("Seed applied.")

if __name__ == "__main__":
    main()
