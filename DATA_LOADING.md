# Dashboard Data Loading Guide

## Overview

The OpenClaw Dashboard uses a **3-tier fallback system** to load operational data:

1. **Pre-generated data file** (recommended for production)
2. **Live OpenClaw CLI** (recommended for local development)
3. **Placeholder data** (fallback when neither above is available)

This document explains how data flows through the system and how to troubleshoot when the dashboard shows placeholder data instead of real data.

## Data Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ LOCAL BUILD PROCESS (npm run build)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: scripts/generate-live-data.js                           │
│  ├─ Executes: openclaw agents list --json                        │
│  ├─ Executes: openclaw sessions list --json                      │
│  ├─ Executes: openclaw cron list --json                          │
│  └─ Writes: data/generated-data.json                             │
│                                                                   │
│  Step 2: next build                                              │
│  └─ Compiles Next.js app to .next/ directory                    │
│                                                                   │
│  Step 3: scripts/copy-data-to-build.js (post-build)             │
│  └─ Copies: data/generated-data.json → .next/server/generated-data.json │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ RUNTIME (next start or npm run dev)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  app/api/dashboard-data/route.ts                                 │
│  │                                                                │
│  ├─ Try 1: Load .next/server/generated-data.json (Netlify)      │
│  │   ✓ Success → Return live data                               │
│  │   ✗ Not found → Try Step 2                                   │
│  │                                                                │
│  ├─ Try 2: Load data/generated-data.json (local dev)            │
│  │   ✓ Success → Return live data                               │
│  │   ✗ Not found → Try Step 3                                   │
│  │                                                                │
│  ├─ Try 3: Execute live OpenClaw CLI (if binary available)      │
│  │   ✓ Success → Return live data                               │
│  │   ✗ Not available or failed → Use Step 4                    │
│  │                                                                │
│  └─ Try 4: Use placeholder data                                  │
│      └─ Returns: data/dashboard-data.json (static/demo data)    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
                          API Response (/api/dashboard-data)
                                    ↓
                        Dashboard UI (auto-refreshes every 30s)
```

## Quick Troubleshooting

### The dashboard is showing placeholder data

**Check 1: Verify generated data file exists**

```bash
# Local development
ls -lh data/generated-data.json

# After build
ls -lh .next/server/generated-data.json
```

**Check 2: Debug the current state**

```bash
# Visit the debug endpoint in your browser or curl
curl http://localhost:3000/api/debug/data-status

# Or check the network tab in browser DevTools
# Look for /api/dashboard-data response
```

**Check 3: Regenerate data**

```bash
# Generate fresh data from live OpenClaw CLI
npm run generate-data

# Rebuild the application
npm run build

# Start the server
npm run start
```

**Check 4: Verify OpenClaw binary is accessible**

```bash
ls -lh ~/.openclaw/bin/openclaw
```

If the file doesn't exist, OpenClaw is not installed on this machine.

## Different Scenarios

### Scenario 1: Local Development with Live Data ✓ RECOMMENDED

You want the dashboard to show real agent and cron data from your local OpenClaw installation.

**Requirements:**
- OpenClaw installed at `~/.openclaw/bin/openclaw`
- Running `npm run dev` (development server)

**Steps:**
1. Ensure OpenClaw is installed: `which openclaw`
2. Start dev server: `npm run dev`
3. Visit `http://localhost:3000`
4. Dashboard fetches live data from CLI on each request
5. Check API output in browser Network tab → `/api/dashboard-data`

**Pros:**
- Real-time data updates
- No build step needed

**Cons:**
- Requires OpenClaw binary available
- Slower API responses (CLI execution adds latency)

### Scenario 2: Production Deployment with Pre-generated Data ✓ RECOMMENDED

You've built the app locally with `npm run build` and want to deploy with real data captured at build time.

**Requirements:**
- Local machine with OpenClaw installed
- Pre-build generation creates `data/generated-data.json`
- Post-build copy creates `.next/server/generated-data.json`

**Steps:**
1. Ensure OpenClaw is installed: `which openclaw`
2. Build app: `npm run build`
   - ✓ `scripts/generate-live-data.js` runs (generates data)
   - ✓ Next.js builds
   - ✓ `scripts/copy-data-to-build.js` runs (copies data to build)
3. Deploy `.next/` directory to production (Netlify, Vercel, etc.)
4. At runtime, API loads `.next/server/generated-data.json`
5. Dashboard shows the data that was captured at build time

**Pros:**
- Works on Netlify and other serverless platforms
- No CLI execution needed at runtime (fast)
- Deployable without OpenClaw in production

**Cons:**
- Data is stale (captured at build time)
- Need to rebuild + redeploy to refresh data

### Scenario 3: Netlify Deployment

Netlify build environment doesn't have OpenClaw binary available.

**Steps:**
1. On your local machine: `npm run generate-data`
   - Creates `data/generated-data.json` with current state
2. Commit to git: `git add data/generated-data.json && git commit -m "..."`
3. Push to GitHub: `git push`
4. Netlify auto-triggers build
   - ✓ `npm run generate-data` tries to run but falls back to placeholder
   - ✓ Next.js builds
   - ✓ `npm run build` post-build step copies data
5. Deploys with data captured on your local machine

**Note:** The `netlify.toml` should include:
```toml
[build]
  command = "npm run build"
```

The build script in `package.json` now runs post-build steps automatically.

### Scenario 4: OpenClaw Not Available (Expected Fallback)

When running on a machine without OpenClaw (e.g., CI/CD, Netlify):

**What happens:**
1. `scripts/generate-live-data.js` detects missing binary, uses placeholder data
2. `data/generated-data.json` contains placeholder data
3. Post-build copy happens, `.next/server/` has placeholder data
4. API serves placeholder data
5. Dashboard shows "Clawd", "Coder", "Punter", etc. with demo stats

**This is expected and OK!** The system gracefully degrades.

## Files and Directories

```
openclaw-dashboard/
├── data/
│   ├── dashboard-data.json          # ← Placeholder/template data
│   └── generated-data.json          # ← Generated at build time (git-ignored)
│
├── scripts/
│   ├── generate-live-data.js        # ← Pre-build: fetches live data
│   └── copy-data-to-build.js        # ← Post-build: copies data to .next/
│
├── app/
│   ├── api/
│   │   ├── dashboard-data/route.ts  # ← Main API route (data loading logic)
│   │   └── debug/
│   │       └── data-status/route.ts # ← Debug endpoint for troubleshooting
│   └── page.tsx                     # ← Frontend (uses API every 30s)
│
├── .gitignore                        # ← Ignores generated-data.json
├── package.json                      # ← Build scripts
└── DATA_LOADING.md                   # ← This file
```

## Environment Variables

Currently, no special environment variables are required. The system auto-detects:

- **OpenClaw binary:** `~/.openclaw/bin/openclaw` (checked at runtime)
- **GitHub token:** Optional (for GitHub board integration)
  - If not set, GitHub board section shows placeholder data

**Future:** Consider adding:
```bash
OPENCLAW_BINARY_PATH=  # Override OpenClaw binary location
GITHUB_TOKEN=          # Required for GitHub project board data
```

## Debugging

### Enable verbose logging

The API route logs extensively. Check:

1. **Development Server Logs**
   ```bash
   npm run dev
   # Look for [dashboard] and [generate] log lines
   ```

2. **Browser Console**
   - Open DevTools (F12)
   - Look for fetch errors in Network tab
   - Check `/api/dashboard-data` response

3. **Debug Endpoint**
   ```bash
   curl http://localhost:3000/api/debug/data-status | jq
   ```
   Returns: file paths, existence, validity, and recommendations

### Check what data the API is returning

```bash
# Development
curl http://localhost:3000/api/dashboard-data | jq '.agents'

# Production
curl https://your-domain.com/api/dashboard-data | jq '.agents'
```

### Validate generated data structure

```bash
# Validate JSON syntax
cat data/generated-data.json | jq . > /dev/null && echo "✓ Valid JSON"

# Check agents
jq '.agents | length' data/generated-data.json

# Check cron jobs
jq '.crons.jobs | length' data/generated-data.json
```

## Performance Notes

- **Pre-generated data:** ~0ms (file read)
- **Live CLI fetch:** ~200-500ms per command (3-4 commands)
- **GitHub GraphQL API:** ~500-1000ms
- **Total API response time:** Usually <1s

The dashboard auto-refreshes every 30 seconds, so slight latency is acceptable.

## Next Steps

1. **For Local Development:** Just run `npm run dev`
   - Dashboard will fetch live data from your OpenClaw installation

2. **For Production:** Run `npm run build` before deploying
   - Captures data at build time
   - Ensures data is available even if OpenClaw isn't available at runtime

3. **For Netlify:** Push your code with generated data
   - Netlify auto-runs `npm run build`
   - Pre-generated data is deployed and available at runtime

4. **Troubleshooting:** Check `/api/debug/data-status` for diagnostics

## Questions?

Check the logs in:
- `app/api/dashboard-data/route.ts` - Main API logic
- `scripts/generate-live-data.js` - Data generation
- `scripts/copy-data-to-build.js` - Build-time copy
- Browser Network tab - API response
