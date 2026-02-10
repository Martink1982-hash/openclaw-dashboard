# OpenClaw Dashboard

An always-on operational dashboard for the OpenClaw agent network. Built with Next.js 15+, Tailwind CSS, and shadcn-style UI components, it keeps agent health, project activity, the Back-to-Lay pipeline, and core ops standing blocks visible in one clean view.

## What the dashboard shows

1. **Agent Overview** — cards for Clawd, Coder, Punter, Content Writer, Designer, and Ops Handler with their current state, monthly sessions, token usage, and estimated cost in GBP.
2. **Projects & Activity** — active projects, the recent activity log, and content produced during the week.
3. **Back to Lay Pipeline** — daily status, qualified horses, and trading stats for the B2L strategy.
4. **Operational Snapshot** — cron job statuses plus next runs, GitHub board In Progress items, and the next 7 days of calendar highlights.

## How it works

- Data is read from `data/dashboard-data.json` and surfaced via `app/api/dashboard-data/route.ts` so the UI always reflects the latest JSON configuration.
- The client-side page polls `/api/dashboard-data` every 30 seconds, keeping the view up to date without a manual refresh.
- The UI is composed of Tailwind + shadcn-style Card/Badge primitives to keep the layout minimal and consistent.

## Getting started locally

```bash
cd openclaw-dashboard
npm install
npm run dev
```

Visit <http://localhost:3000> in your browser to keep the dashboard running locally. The page will auto-refresh data every 30 seconds; you can edit `data/dashboard-data.json` to adjust what it displays.

## Stack & key dependencies

- Next.js 15+ with the App Router
- TypeScript + React
- Tailwind CSS via the `app` template
- `class-variance-authority` for shadcn-style component variants
- Local JSON storage and a lightweight API route for data hygiene
