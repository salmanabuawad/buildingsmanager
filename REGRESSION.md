# Running the Playwright regression

The regression suite lives in `tests/e2e/regression-pstaging.spec.ts`
and runs against `https://pstaging.wavelync.com/` with the
`regression_tester` account.

## Fresh-clone quickstart (Windows)

```powershell
# 1. Install Node.js 20+ (once per machine)
winget install -e --id OpenJS.NodeJS.LTS

# 2. Clone and install
git clone <repo-url> buildingsmanager
cd buildingsmanager
npm ci
npx playwright install chromium

# 3. Run
pwsh scripts\run-regression-pstaging.ps1
```

Headed (visible Chrome window, 3-second pause between actions):

```powershell
pwsh scripts\run-regression-pstaging.ps1 -Headed
```

Filter to a subset:

```powershell
pwsh scripts\run-regression-pstaging.ps1 -Grep "23\."            # just block 23
pwsh scripts\run-regression-pstaging.ps1 -Headed -SlowMo 500     # faster headed
```

## Fresh-clone quickstart (macOS / Linux)

```bash
git clone <repo-url> buildingsmanager
cd buildingsmanager
npm ci
npx playwright install chromium
bash scripts/run-regression-pstaging.sh
# headed:
bash scripts/run-regression-pstaging.sh --headed
# filter:
bash scripts/run-regression-pstaging.sh --grep "23\."
```

## Environment overrides

All via env var (or flag on the runner scripts):

| Var                 | Default                            | Purpose                           |
| ------------------- | ---------------------------------- | --------------------------------- |
| `TEST_BASE_URL`     | `https://pstaging.wavelync.com/`   | Target environment                |
| `TEST_USER_NAME`    | `regression_tester`                | Login user                        |
| `TEST_PASSWORD`     | `RegressionTester2026!`            | Login password                    |
| `HEADLESS`          | `true` (headless)                  | Set `false` for visible browser   |
| `PW_CHANNEL`        | — (uses Playwright chromium)       | Set `chrome` or `msedge` to route |
|                     |                                    | through system browser (needed on |
|                     |                                    | Windows laptops without the right |
|                     |                                    | VC++ runtime).                    |
| `PW_SLOWMO_MS`      | `3000` when headed, `0` headless   | Per-action delay                  |

## Seeing failures

The runner prints a list of failing tests on exit. The full HTML report
with screenshots, videos, and traces for every failure is produced by
Playwright automatically; view with:

```bash
npx playwright show-report
```

## Deploying pstaging

The regression runs against pstaging which is provisioned by
`scripts/deploy-pstaging.sh` on `root@185.229.226.37`. Redeploy:

```bash
bash scripts/deploy-pstaging.sh
```

(That script rsyncs `backend/` + `src/` build output and restarts the
`buildingsmanager-pstaging.service` systemd unit on port 8006.)
