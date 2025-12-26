# Node.js Version Upgrade Required

## Current Situation

You are currently using **Node.js v16.20.2**, but this project requires **Node.js 18.0.0 or higher** (preferably Node.js 20.x LTS).

The error `crypto$2.getRandomValues is not a function` occurs because Node.js 16 doesn't have the same crypto API that Node.js 18+ provides.

## Solution: Upgrade Node.js

### Option 1: Direct Installation (Easiest)

1. **Download Node.js 20.x LTS:**
   - Visit: https://nodejs.org/
   - Download the Windows Installer (.msi) for the LTS version (20.x)
   - Run the installer and follow the setup wizard
   - The installer will automatically replace your current Node.js version

2. **Verify Installation:**
   ```powershell
   node --version
   ```
   Should show `v20.x.x` or `v18.x.x`

3. **Reinstall Dependencies:**
   ```powershell
   npm install
   ```

4. **Run Tests:**
   ```powershell
   npm run test:run tests/regression-comprehensive.test.ts
   ```

### Option 2: Using NVM for Windows (Recommended for Managing Multiple Versions)

1. **Install NVM for Windows:**
   - Download from: https://github.com/coreybutler/nvm-windows/releases
   - Download `nvm-setup.exe` from the latest release
   - Run the installer

2. **Install Node.js 20:**
   ```powershell
   nvm install 20.11.0
   nvm use 20.11.0
   ```

3. **Verify:**
   ```powershell
   node --version
   ```

4. **Reinstall Dependencies:**
   ```powershell
   npm install
   ```

### Option 3: Using Chocolatey (If You Have It Installed)

```powershell
choco upgrade nodejs
```

## After Upgrading

Once Node.js is upgraded:

1. Delete `node_modules` and `package-lock.json` (optional, but recommended):
   ```powershell
   Remove-Item -Path node_modules -Recurse -Force
   Remove-Item -Path package-lock.json -Force
   ```

2. Reinstall dependencies:
   ```powershell
   npm install
   ```

3. Run the comprehensive regression tests:
   ```powershell
   npm run test:run tests/regression-comprehensive.test.ts
   ```

## Verification

After upgrading, you should see:
- `node --version` shows v18.x.x or v20.x.x
- No crypto errors when running tests
- Tests can execute successfully

## Notes

- Node.js 20.x LTS is recommended (long-term support)
- Node.js 18.x is the minimum required version
- Your current projects using Node.js 16 will need to be updated or run with the older version using nvm

