# Email queue daemon

Processes the `export_email_queue` table: sends one Excel attachment per row, then marks the row as sent or failed.

## Run

From project root, with Supabase **service role** key (bypasses RLS so the daemon can read/update the queue):

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co SUPABASE_SERVICE_ROLE_KEY=your_service_role_key node email-worker/daemon.js
```

On Windows (PowerShell):

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="your_key"; node email-worker/daemon.js
```

- **SUPABASE_URL**: same as in the app (e.g. from Netlify env).
- **SUPABASE_SERVICE_ROLE_KEY**: from Supabase Dashboard → Project settings → API → service_role (secret). Do not use the anon key.

Email settings are read from `system_configuration` (name `email_config`). Ensure SMTP is configured in the app’s System Configuration so the daemon can send.

## Behaviour

- Polls every 5 seconds.
- Processes up to 10 pending rows per run.
- Each row = one email with one Excel attachment (no ZIP).
- Failed sends are marked `failed` with `error_message`; the daemon does not retry them automatically.
