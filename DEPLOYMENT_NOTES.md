# Dashboard Live Data - Netlify Deployment Fix

## Problem
The dashboard was showing placeholder data on Netlify instead of live data because:
- The API route tried to run `openclaw` CLI commands via `execFile()`
- The Netlify build environment doesn't have the `openclaw` binary
- CLI commands would fail silently, causing the API to fall back to placeholder data

## Solution
Implemented a **pre-build data generation script** that:
1. Runs on local machine before Netlify build
2. Captures live OpenClaw data (agents, sessions, cron jobs)
3. Saves to `data/generated-data.json`
4. API route uses this pre-generated file on Netlify

## Files Modified/Created

### New Files
- **`scripts/generate-live-data.js`** - Pre-build data generation script
- **`netlify.toml`** - Netlify build configuration
- **`DEPLOYMENT_NOTES.md`** - This file

### Modified Files
- **`app/api/dashboard-data/route.ts`** - Updated to use generated data
- **`package.json`** - Added `generate-data` script
- **`.gitignore`** - Ignores `generated-data.json`

## Build Process

### Local Development
```bash
npm run dev
```
- Uses live `openclaw` CLI commands
- Real-time data updates every 30 seconds on the dashboard

### Netlify Build
```bash
npm run generate-data && npm run build
```
1. `generate-data` script runs OpenClaw CLI commands
2. Captures agents, sessions, cron jobs into `data/generated-data.json`
3. Netlify build proceeds with this data
4. API route serves the pre-generated data

## Data Sources on Netlify

| Data | Source | Frequency |
|------|--------|-----------|
| Agents | `generated-data.json` | Generated at build time |
| Cron Jobs | `generated-data.json` | Generated at build time |
| GitHub Projects | GitHub API (live) | Fetched on every request |
| Trading Data | B2L markdown file | Fetched from deployed repo |

## Environment Variables

No special environment variables needed. The script auto-detects:
- OpenClaw binary location: `~/.openclaw/bin/openclaw`
- Generated data output: `data/generated-data.json`

## Troubleshooting

**Issue:** Dashboard still shows placeholder data after deploy

**Solution:** 
1. Verify Netlify build logs show `[generate]` commands succeeded
2. Check that `generate-data` runs before build in netlify.toml
3. If OpenClaw service isn't running locally, pre-generate data manually:
   ```bash
   npm run generate-data
   git commit data/generated-data.json
   git push
   ```

**Issue:** Generated data is stale

**Solution:**
1. The data is generated at build time
2. For more frequent updates, rebuild the Netlify deployment
3. Or manually trigger `npm run generate-data` before pushing

## Performance Impact

- Build time: +2-3 seconds (for OpenClaw CLI calls)
- No runtime performance impact
- Generated data file is small (~5KB)

## Future Improvements

1. **Sub-agents**: Extend script to properly handle sub-agent sessions
2. **Incremental Updates**: Cache generated data between builds
3. **GitHub Token**: Add to Netlify env vars if not using browser-based fetching
4. **Health Checks**: Add validation that generated data isn't stale (>24h old)
