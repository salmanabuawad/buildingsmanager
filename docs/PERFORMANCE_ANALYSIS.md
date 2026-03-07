# Performance Analysis

**Last checked:** March 2025

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Database indexes | ✅ Good | Key tables indexed (assets, buildings, audit, inspection_tasks) |
| API caching | ⚠️ Partial | Asset types cached; buildings/assets cache underused |
| Frontend bundle | ⚠️ Large | Main chunk ~3.2MB; PDF.js 445KB |
| Rate limiting | ✅ Present | Auth endpoints: 10/min |
| DB connection pool | ✅ OK | pool_size=10, max_overflow=20 |
| Nginx cache | ⚠️ Aggressive no-cache | Assets use no-cache; consider long cache for hashed files |

---

## 1. Frontend

### Bundle size (Vite build)
- **index.js** ~3.2MB (gzip ~904KB) – exceeds 500KB warning
- **pdf-C2NMrW9w.js** 445KB – PDF viewer, rarely needed on first load
- **zipExport** ~97KB, **csvExport** ~0.9KB

**Recommendations:**
- Add `manualChunks` in `vite.config.ts` to split:
  - `pdf` – lazy load when opening PDF viewer
  - `xlsx` – lazy load for Excel import
- Consider dynamic `import()` for `AssetsFileImport`, `AssetDetails` (route-level code splitting)

### Caching (REDUNDANT_API_CALLS_ANALYSIS.md)
- ✅ **Priority 1 done:** Asset types use `getAssetTypes()` from ValidationContext
- ⚠️ **Priority 2–4:** Buildings, assets, addressList still have redundant calls
- Use `getBuildings()` and `getAllAssets()` where possible instead of direct API calls

---

## 2. Backend

### Database
- **Pool:** `pool_size=10`, `max_overflow=20` – suitable for moderate load
- **Indexes:** Present on `assets.building_number`, `audit.*`, `inspection_tasks.*`, `asset_files.asset_id`, etc.

### Rate limiting
- Auth: `10/minute` on login, password reset, token refresh
- No rate limit on data endpoints (buildings, assets, etc.) – consider for `/api/data/*` if abuse is a concern

### Heavy operations
- **save_assets_bulk** – Python transaction; no N+1
- **get_assets_by_ids** – Single `SELECT ... WHERE asset_id IN (...)` – efficient
- **Validation** – Runs in parallel where `cachedData` is passed; avoid repeated API calls

---

## 3. Nginx

### Current config
- `index.html`: `Cache-Control: no-cache` (correct for SPA)
- `/assets/*`: `Cache-Control: no-cache` (forces fresh load every time)

**Recommendation:** For hashed assets (e.g. `index-ABC123.js`), use long cache (e.g. `max-age=31536000, immutable`) since the filename changes on deploy. Keep `no-cache` only for `index.html`.

---

## 4. Quick checks

### Health endpoint
```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://wavelync.com/api/health
```

### API latency (with auth)
```bash
# After login, use token:
curl -s -o /dev/null -w "%{time_total}s\n" -H "Authorization: Bearer <token>" https://wavelync.com/api/buildings
```

---

## 5. Recommended next steps

1. **Frontend:** Add `manualChunks` for pdf/xlsx; lazy-load heavy components
2. **API cache:** Use `getBuildings()` / `getAllAssets()` in more components (see REDUNDANT_API_CALLS_ANALYSIS.md)
3. **Nginx:** Use `max-age=31536000` for `/assets/*` (hashed filenames)
4. **Monitoring:** Add response-time logging or APM if scaling up
