# Deploy to profile.wavelync.com

- **App URL:** https://profile.wavelync.com/  
- **SSH host:** `profile.wavelync.com` (override with `$env:DEPLOY_HOST`, e.g. `185.229.226.37`)  
- **SSH user:** `root` (profilegroup server)  
- **Remote path:** `/var/www/html` (override with `$env:DEPLOY_PATH`)

## Deploy (after build)

```powershell
# Option A: Password auth (use PuTTY pscp/plink)
# Install PuTTY from https://www.putty.org/ so pscp and plink are in PATH.
$env:DEPLOY_SSH_PASS = "YourPassword"   # Do not commit this
.\deploy-to-server.ps1
```

```powershell
# Option B: SSH keys (no password)
# Set up key-based login for root@profile.wavelync.com, then:
.\deploy-to-server.ps1
```

```powershell
# Build + deploy in one step
npm run deploy:server
# If using password, set DEPLOY_SSH_PASS first as above.
```

## Notes

- Do not commit your password. Set `DEPLOY_SSH_PASS` only in your session or in a local file that is in `.gitignore`.
- The script uploads the contents of `dist/` to the server and replaces the existing app files.
