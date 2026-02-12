# Dashboard Live Data - Netlify Deployment Fix

## Problem (Fixed Feb 10, 2026)
The dashboard was showing placeholder data on Netlify instead of live data because:
- The API route tried to run `openclaw` CLI commands via `execFile()`
- The Netlify build environment doesn't have the `openclaw` binary
- Even with pre-build data generation, the file wasn't being deployed to Netlify
  - `generated-data.json` was created in the project root
  - But `netlify.toml` only publishes the `.next/` directory
  - The API route couldn't find the file at runtime on Netlify

## Solution ✓
Implemented a **3-step data pipeline**:
1. **Pre-build data generation** (`scripts/generate-live-data.js`)
   - Runs `openclaw` CLI commands locally before Netlify build
   - Captures agents, sessions, cron jobs into `data/generated-data.json`

2. **Post-build copy** (`scripts/copy-data-to-build.js`)
   - Runs AFTER Next.js build completes
   - Copies `generated-data.json` → `.next/server/generated-data.json`
   - Ensures file is included in the published directory

3. **Runtime API route** (`app/api/dashboard-data/route.ts`)
   - Looks for data in `.next/server/generated-data.json` (Netlify)
   - Falls back to `data/generated-data.json` (local dev)
   - Falls back to live CLI calls if available
   - Falls back to placeholder data if all else fails

## Files Modified/Created

### New Files
- **`scripts/generate-live-data.js`** - Pre-build data generation (runs before Next.js build)
- **`scripts/copy-data-to-build.js`** - Post-build copy (runs after Next.js build) ✓ FIXED
- **`netlify.toml`** - Netlify build configuration
- **`DEPLOYMENT_NOTES.md`** - This file

### Modified Files
- **`app/api/dashboard-data/route.ts`** - Updated to check multiple paths for data file ✓ FIXED
- **`package.json`** - Build script now includes post-build copy step ✓ FIXED
- **`.gitignore`** - Ignores `generated-data.json`

## Build Process

### Local Development
```bash
npm run dev
```
- Tries to read `data/generated-data.json` (if available)
- Falls back to live `openclaw` CLI commands
- Real-time data updates available

### Netlify Build (Build Command in netlify.toml)
```bash
npm run generate-data && npm run build
```

**Step 1: Generate Data** (`generate-data` script)
- Runs OpenClaw CLI commands locally
- Captures agents, sessions, cron jobs into `data/generated-data.json`

**Step 2: Build** (`next build` via package.json)
- Next.js compiles app into `.next/` directory

**Step 3: Copy Data** (post-build step in package.json) ✓ FIXED FEB 10
- `copy-data-to-build.js` runs after Next.js build
- Copies `data/generated-data.json` → `.next/server/generated-data.json`
- This ensures the file is in the published directory

## Data Sources on Netlify

| Data | Source | Frequency |
|------|--------|-----------|
| Agents | `generated-data.json` | Generated at build time |
| Cron Jobs | `generated-data.json` | Generated at build time |
| GitHub Projects | GitHub API (live) | Fetched on every request |
| Trading Data | B2L markdown file | Fetched from deployed repo |

## Environment Variables

No custom environment variables are required, but generation behavior depends on build mode:
- OpenClaw binary location is auto-detected at `~/.openclaw/bin/openclaw`
- Generated data output is `data/generated-data.json`
- In **production builds** (`NODE_ENV=production`), missing OpenClaw CLI is a hard failure and the build exits with code `1`
- In non-production builds, script writes placeholder data with metadata:
  - `__meta.source = "placeholder-fallback"`
  - `__meta.isFallback = true`
  - `__meta.reason = "missing-openclaw-cli"`

For live data generation in CI/Netlify, the build environment must provide the OpenClaw CLI at the expected path and credentials/context needed for `openclaw agents/sessions/cron` commands.

The generator now emits a one-line summary in logs, e.g.:
- Live: `[generate] SUMMARY: source=openclaw-live fallback=no ...`
- Fallback: `[generate] SUMMARY: source=placeholder-fallback fallback=yes ...`

## Troubleshooting

**Issue:** Dashboard still shows placeholder data after deploy

**Debug Checklist:**
1. ✓ Check Netlify build logs for all three steps:
   - `[generate]` commands output
   - `next build` completed
   - `[copy-data]` confirmation message
2. ✓ Verify both files exist locally after build:
   - `data/generated-data.json` (generated)
   - `.next/server/generated-data.json` (copied)
3. ✓ Test locally:
   ```bash
   npm run build
   npm start  # Run production build locally
   curl -u admin:openclaw http://localhost:3000/api/dashboard-data
   ```
4. ✓ If OpenClaw binary isn't available, ensure pre-generated data is committed:
   ```bash
   npm run generate-data
   git add data/generated-data.json
   git push
   ```

**Issue:** Generated data is stale

**Solution:**
1. Data is captured at build time
2. To refresh: manually trigger `npm run generate-data && npm run build` locally, then push
3. Or manually rebuild the Netlify deployment via the Netlify dashboard
4. Or set up a scheduled build trigger in Netlify

## Performance Impact

- Build time: +2-3 seconds (for OpenClaw CLI calls)
- No runtime performance impact
- Generated data file is small (~5KB)

## Future Improvements

1. **Sub-agents**: Extend script to properly handle sub-agent sessions
2. **Incremental Updates**: Cache generated data between builds
3. **GitHub Token**: Add to Netlify env vars if not using browser-based fetching
4. **Health Checks**: Add validation that generated data isn't stale (>24h old)
