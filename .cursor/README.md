# Cursor MCP configuration

This folder configures [Model Context Protocol](https://modelcontextprotocol.io) servers for Cursor.

## Supabase MCP

- **Config:** `mcp.json` connects to the official Supabase MCP (HTTP) for project `mmqnrwjjxewrgwczezzf`.
- **Mode:** `read_only=true` so the agent can run queries but not apply migrations or write data.
- **After adding/changing:** Restart Cursor or run **Developer: Reload Window** (Ctrl+Shift+P) so MCP servers reconnect.
- **First use:** When the agent uses Supabase tools, Cursor may prompt you to sign in to Supabase (OAuth); choose the organization that owns this project.

To allow the agent to apply migrations, change the URL in `mcp.json` to remove `read_only=true` (or set `read_only=false`). Prefer read-only for safety.
