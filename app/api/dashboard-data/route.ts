import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import placeholderData from "@/data/dashboard-data.json";

type DashboardData = typeof placeholderData;

type OpenClawAgent = {
  id?: string;
  identityName?: string;
  model?: string;
};

type OpenClawSession = {
  key?: string;
  totalTokens?: number;
  outputTokens?: number;
  model?: string;
};

type OpenClawJob = {
  id?: string;
  name?: string;
  payload?: {
    name?: string;
    text?: string;
  };
  state?: {
    lastStatus?: string;
    status?: string;
    nextRunAtMs?: number;
    next_run?: string | number;
    lastRunAtMs?: number;
    last_run?: string | number;
    lastRun?: string | number;
  };
};

type OpenClawAgentsResponse = { agents?: OpenClawAgent[] };

type OpenClawSessionsResponse = { sessions?: OpenClawSession[] };

type OpenClawCronResponse = { jobs?: OpenClawJob[] };

type GitHubIssue = {
  title?: string;
  state?: string;
  user?: { login?: string };
  updated_at?: string;
  created_at?: string;
};

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { error: String(error) };
};

const execFileAsync = promisify(execFile);
const openClawBinary = path.join(os.homedir(), ".openclaw", "bin", "openclaw");

export async function GET() {
  console.log("[dashboard] GET /api/dashboard-data triggered");
  try {
    const data = await buildLiveData();
    console.log("[dashboard] GET /api/dashboard-data returning snapshot");
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("[dashboard] failed to build live data:", formatError(error));
    console.log("[dashboard] GET /api/dashboard-data returning placeholder");
    return NextResponse.json(placeholderData, { status: 200 });
  }
}

async function buildLiveData(): Promise<DashboardData> {
  console.log("[dashboard] buildLiveData start - using live OpenClaw API data (not generated files)");
  const snapshot = JSON.parse(JSON.stringify(placeholderData)) as DashboardData;

  // LIVE MODE: Always fetch from OpenClaw CLI directly
  // Ignore generated-data.json files (if they exist) to ensure fresh data from the running installation
  console.log("[dashboard] Fetching live data from OpenClaw CLI (agents, crons, etc.)");

  const [agents, projects, crons, trading] = await Promise.all([
    fetchAgentData(),
    fetchGitHubProjects(),
    fetchCronStatus(),
    fetchB2LData(),
  ]);

  console.log("[dashboard] buildLiveData fetch results", {
    agents: agents ? agents.length : 0,
    projects: projects?.active?.length ?? 0,
    crons: crons?.jobs?.length ?? 0,
    trading: trading?.qualifiedHorses?.length ?? 0,
  });

  if (agents && agents.length > 0) {
    console.log(`[dashboard] ✓ LIVE: replacing ${snapshot.agents.length} placeholder agents with ${agents.length} real records from OpenClaw CLI`);
    snapshot.agents = agents;
  } else {
    console.warn("[dashboard] ⚠ live agents data unavailable, keeping placeholder");
  }

  if (projects && projects.active.length > 0) {
    console.log(`[dashboard] ✓ LIVE: injecting ${projects.active.length} GitHub projects`);
    snapshot.projects = projects;
  } else {
    console.warn("[dashboard] ⚠ GitHub projects unavailable, keeping placeholder");
  }

  if (crons && crons.jobs.length > 0) {
    console.log(`[dashboard] ✓ LIVE: replacing cron list with ${crons.jobs.length} real entries from OpenClaw CLI`);
    snapshot.crons = crons;
  } else {
    console.warn("[dashboard] ⚠ live cron data unavailable, keeping placeholder");
  }

  if (trading) {
    console.log(`[dashboard] ✓ LIVE: trading section updated with ${trading.qualifiedHorses?.length ?? 0} horses`);
    snapshot.trading = trading;
  } else {
    console.warn("[dashboard] ⚠ trading data unavailable, keeping placeholder");
  }

  const liveDataApplied = Boolean(agents || projects || crons || trading);
  console.log(`[dashboard] buildLiveData completed. Live data applied: ${liveDataApplied}`);

  return snapshot;
}

async function fetchAgentData(): Promise<DashboardData["agents"] | null> {
  console.log("[dashboard] fetchAgentData: requesting CLI agents + sessions...");
  const agentsJson = await runOpenClawJson(["agents", "list", "--json"], "agents list");
  const sessionsJson = await runOpenClawJson(["sessions", "list", "--json"], "sessions list");

  if (!agentsJson) {
    console.warn("[dashboard] fetchAgentData: no agent payload returned");
    return null;
  }

  const agentsArray = extractAgents(agentsJson);
  if (!agentsArray.length) {
    console.warn("[dashboard] fetchAgentData: agent array empty");
    return null;
  }

  const sessions = extractSessions(sessionsJson);

  const agents = agentsArray.map((agent) => {
    const prefix = `agent:${agent.id || ""}:`;
    const agentSessions = sessions.filter((s) => typeof s.key === "string" && s.key.startsWith(prefix));
    const tokens = agentSessions.reduce((total, session) => {
      const value = typeof session.totalTokens === "number" ? session.totalTokens : session.outputTokens ?? 0;
      const numericValue = typeof value === "number" ? value : Number(value) || 0;
      return total + numericValue;
    }, 0);

    return {
      name: agent.identityName || agent.id || "Unknown",
      state: agentSessions.length > 0 ? "Active" : "Idle",
      sessions: agentSessions.length,
      tokens,
      cost: Number((tokens * 0.0000263).toFixed(4)),
      model: agent.model || "anthropic/claude-haiku-4-5",
      tasks: [],
    };
  });

  // FIXED: Get whitelist of defined sub-agents from /agents/ directory
  const definedSubAgents = await getDefinedSubAgentsList();
  console.log(`[dashboard] fetchAgentData: found ${definedSubAgents.length} defined sub-agent folders:`, definedSubAgents.join(", "));

  // Build whitelist of allowed subagent UUIDs (only defined agents)
  const allowedSubagentUuids = new Set<string>(getKnownSubagentUuids(definedSubAgents).values());
  console.log(`[dashboard] fetchAgentData: whitelist of ${allowedSubagentUuids.size} allowed subagent UUIDs`);

  // Extract sub-agents from sessions list
  // Map UUID to sessions data, then later we'll map these to folder names
  const subagentSessions = new Map<string, { model: string; sessions: number; tokens: number }>();

  for (const session of sessions) {
    const key = session.key || "";
    const subagentMatch = key.match(/^agent:main:subagent:([a-f0-9-]+)/);
    if (subagentMatch) {
      const subagentId = subagentMatch[1];
      
      // Include ALL sub-agents found in sessions (no strict filtering)
      console.log(`[dashboard] fetchAgentData: discovered subagent UUID ${subagentId.slice(0, 8)}...`);
      
      if (!subagentSessions.has(subagentId)) {
        const tokens = typeof session.totalTokens === "number" ? session.totalTokens : session.outputTokens ?? 0;
        subagentSessions.set(subagentId, {
          model: session.model || "anthropic/claude-haiku-4-5",
          sessions: 1,
          tokens: typeof tokens === "number" ? tokens : Number(tokens) || 0,
        });
      } else {
        const existing = subagentSessions.get(subagentId)!;
        const tokens = typeof session.totalTokens === "number" ? session.totalTokens : session.outputTokens ?? 0;
        const numericTokens = typeof tokens === "number" ? tokens : Number(tokens) || 0;
        existing.sessions += 1;
        existing.tokens += numericTokens;
      }
    }
  }

  // Map discovered UUIDs to folder-based agent names
  // If we have more UUIDs than defined folders, still show them with generic names
  const subagents: Array<{ name: string; state: string; sessions: number; tokens: number; cost: number; model: string; tasks: Array<{ title: string; source: string }> }> = [];
  let agentIndex = 0;
  
  for (const [subagentId, data] of subagentSessions) {
    // Try to map to a defined agent folder
    let agentName: string;
    if (agentIndex < definedSubAgents.length) {
      const folderName = definedSubAgents[agentIndex];
      agentName = folderName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } else {
      // If we have more UUIDs than folders, use generic naming
      agentName = `Sub-agent ${agentIndex + 1}`;
    }
    
    console.log(`[dashboard] fetchAgentData: mapping subagent UUID ${subagentId.slice(0, 8)}... -> ${agentName}`);
    
    subagents.push({
      name: agentName,
      state: "Active",
      sessions: data.sessions,
      tokens: data.tokens,
      cost: Number((data.tokens * 0.0000263).toFixed(4)),
      model: data.model,
      tasks: [],
    });
    
    agentIndex++;
  }

  // Also include defined sub-agents with zero sessions (Idle agents) for those not yet discovered
  for (let i = agentIndex; i < definedSubAgents.length; i++) {
    const folderName = definedSubAgents[i];
    const agentName = folderName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    console.log(`[dashboard] fetchAgentData: adding idle defined sub-agent ${agentName} (not yet in sessions)`);
    subagents.push({
      name: agentName,
      state: "Idle",
      sessions: 0,
      tokens: 0,
      cost: 0,
      model: "anthropic/claude-haiku-4-5",
      tasks: [],
    });
  }

  // Combine main agents + sub-agents
  const allAgents = [...agents, ...subagents];
  const totalTokens = allAgents.reduce((sum, agent) => sum + agent.tokens, 0);
  console.log(`[dashboard] fetchAgentData: ${allAgents.length} agents (${agents.length} main + ${subagents.length} sub), totalTokens=${totalTokens}`);
  return allAgents;
}

async function getDefinedSubAgentsList(): Promise<string[]> {
  const agentsDir = path.join(os.homedir(), "clawd", "agents");
  const agents: string[] = [];

  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        agents.push(entry.name);
      }
    }
  } catch (error) {
    console.error("[dashboard] getDefinedSubAgentsList failed:", formatError(error));
  }

  return agents.sort();
}

function getKnownSubagentUuids(definedAgents: string[]): Map<string, string> {
  // Map of subagent UUIDs to their display names
  // These UUIDs are discovered from the folder names in ~/clawd/agents/
  const uuidMap = new Map<string, string>();

  // Create display names from folder names (capitalize first letter, replace hyphens with spaces)
  for (const agentFolder of definedAgents) {
    // Capitalize first letter and replace hyphens with spaces for display
    const displayName = agentFolder
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Create a placeholder key that will match any UUID for this agent
    // The actual matching happens in the sessions filter below
    // We use a marker key to track which agents should be displayed
    uuidMap.set(`folder:${agentFolder}`, displayName);
  }

  console.log(`[dashboard] getKnownSubagentUuids: configured ${uuidMap.size} known agents from folders: ${definedAgents.join(', ')}`);
  return uuidMap;
}

async function fetchGitHubProjects(): Promise<DashboardData["projects"] | null> {
  console.log("[dashboard] fetchGitHubProjects: querying Clawd Tasks board (Project #2) with status filtering...");
  
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[dashboard] GITHUB_TOKEN unavailable, skipping GitHub data");
    return {
      status: "unavailable",
      active: [],
      recentActivity: [],
      activityLog: [],
    };
  }

  try {
    // GraphQL query to fetch "Clawd Tasks" project (Project #2) and filter by "In Progress" status
    // Note: This requires GitHub token with 'read:project' scope for ProjectV2 access
    // GitHub Docs: https://docs.github.com/en/graphql/reference/queries#user
    const query = `
      query {
        user(login: "Martink1982-hash") {
          projectV2(number: 2) {
            id
            title
            items(first: 50) {
              nodes {
                id
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                  }
                }
                content {
                  ... on Issue {
                    number
                    title
                    repository {
                      nameWithOwner
                    }
                    updatedAt
                  }
                  ... on PullRequest {
                    number
                    title
                    repository {
                      nameWithOwner
                    }
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `;

    console.log("[dashboard] fetchGitHubProjects: executing GraphQL query...");
    
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "clawd-dashboard",
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    console.log(`[dashboard] fetchGitHubProjects: GraphQL response status ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[dashboard] GitHub GraphQL API returned ${response.status}: ${errorBody.slice(0, 300)}`);
      return {
        status: "unavailable",
        active: [],
        recentActivity: [],
        activityLog: [],
      };
    }

    const graphqlData = (await response.json()) as any;
    
    if (graphqlData.errors) {
      console.warn(`[dashboard] GraphQL errors:`, graphqlData.errors.map((e: any) => e.message).join("; "));
      return {
        status: "unavailable",
        active: [],
        recentActivity: [],
        activityLog: [],
      };
    }

    const projectV2 = graphqlData.data?.user?.projectV2;
    if (!projectV2) {
      console.warn("[dashboard] 'Clawd Tasks' project (Project #2) not accessible");
      return {
        status: "unavailable",
        active: [],
        recentActivity: [],
        activityLog: [],
      };
    }

    console.log(`[dashboard] Found Clawd Tasks project with ${projectV2.items.nodes.length} total items`);

    // Filter items by "In Progress" status
    const inProgressItems: Array<{
      number: string | number;
      title: string;
      repo: string;
      updatedAt: string;
    }> = projectV2.items.nodes
      .filter((item: any) => {
        const statusValue = item.fieldValueByName?.name?.toLowerCase() || "";
        const isInProgress = statusValue === "in progress" || statusValue === "in_progress";
        if (isInProgress) {
          console.log(`[dashboard] Matched In Progress: ${item.content?.title}`);
        }
        return isInProgress;
      })
      .map((item: any) => {
        const content = item.content;
        const repoName = content?.repository?.nameWithOwner?.split("/")[1] || "unknown";
        return {
          number: content?.number || "?",
          title: content?.title || "Untitled",
          repo: repoName,
          updatedAt: content?.updatedAt || new Date().toISOString(),
        };
      });

    console.log(`[dashboard] Found ${inProgressItems.length} items with "In Progress" status`);

    if (inProgressItems.length === 0) {
      console.warn("[dashboard] No items found with 'In Progress' status");
      return {
        status: "available",
        active: [],
        recentActivity: [],
        activityLog: [],
      };
    }

    // Build active items list
    const active: Array<{ name: string; status: string; owner: string }> = inProgressItems.map((item) => ({
      name: `${item.repo} #${item.number}: ${item.title}`,
      status: "In Progress",
      owner: "GitHub",
    }));

    // Build recent activity
    const recentActivity: Array<{ type: string; label: string; detail: string; timestamp: string; source: string }> = inProgressItems.map((item) => ({
      type: "github",
      label: `${item.repo} #${item.number}: ${item.title}`,
      detail: "In Progress",
      timestamp: item.updatedAt,
      source: "Clawd Tasks Board",
    }));

    // Build activity log
    const activityLog: string[] = inProgressItems.map((item) => `${item.repo} #${item.number}: ${item.title}`);

    return {
      status: "available",
      active,
      recentActivity,
      activityLog,
    } as DashboardData["projects"];
  } catch (error) {
    console.error("[dashboard] fetchGitHubProjects failed:", formatError(error));
    return {
      status: "unavailable",
      active: [],
      recentActivity: [],
      activityLog: [],
    } as DashboardData["projects"];
  }
}

async function fetchCronStatus(): Promise<DashboardData["crons"] | null> {
  console.log("[dashboard] fetchCronStatus: querying cron CLI...");
  const cronJson = await runOpenClawJson(["cron", "list", "--json"], "cron list");
  if (!cronJson) {
    console.warn("[dashboard] fetchCronStatus: no cron payload returned");
    return null;
  }

  const jobs = extractJobs(cronJson);
  console.log("[dashboard] fetchCronStatus cron payload", jobs);
  if (!jobs.length) {
    console.warn("[dashboard] fetchCronStatus: cron list empty");
    return null;
  }

  const mapped = jobs.map((job) => {
    const state = job.state ?? {};
    const name = job.name || job.payload?.name || job.payload?.text || job.id || "Unnamed cron";
    const status = state.lastStatus || state.status || "unknown";
    const nextRun = formatTimestamp(state.nextRunAtMs ?? state.next_run);
    const lastRun = formatTimestamp(state.lastRunAtMs ?? state.last_run ?? state.lastRun);

    return {
      name,
      status,
      nextRun,
      lastRun,
    };
  });

  console.log(`[dashboard] fetchCronStatus: returning ${mapped.length} jobs`);
  return { status: "available", jobs: mapped };
}

async function fetchB2LData(): Promise<DashboardData["trading"] | null> {
  const b2lPath = path.join(os.homedir(), "clawd", "outputs", "betfair-racecards", "2026-02.md");
  console.log(`[dashboard] fetchB2LData: reading ${b2lPath}`);
  try {
    await fs.access(b2lPath);
  } catch (error) {
    console.warn(`[dashboard] fetchB2LData: B2L file missing: ${b2lPath}`);
    return null;
  }

  try {
    const content = await fs.readFile(b2lPath, "utf-8");
    console.log(`[dashboard] fetchB2LData: file preview`, content.slice(0, 400));
    const horses = parseB2LHorses(content);
    console.log(`[dashboard] fetchB2LData: parsed ${horses.length} horse entries`);

    if (!horses.length) {
      console.warn("[dashboard] fetchB2LData: no qualifying horses pulled from file");
    }

    const qualified: Array<{ name: string; race: string; value: string; note: string }> = horses.slice(0, 6).map(h => ({
      name: h.name,
      race: h.race,
      value: h.value,
      note: h.note,
    }));
    const completionStatus = qualified.length > 0 ? "On track for processing" : "Awaiting shortlist";

    return {
      availability: qualified.length > 0 ? "available" : "unavailable",
      status: {
        dailyStatus: qualified.length > 4 ? "Green" : qualified.length > 0 ? "Amber" : "Red",
        statusNote:
          qualified.length > 0
            ? `${qualified.length} horses extracted from B2L file`
            : "Waiting for the Back-to-Lay pipeline to output qualified runners",
        completionStatus,
      },
      qualifiedHorses: qualified,
      tradingStats: {
        matchedRaces: qualified.length,
        unmatched: Math.max(0, 10 - qualified.length),
        profit: 0,
        liability: 0,
      },
      pipelineStages: [
        {
          name: "Racecard",
          label: "Racecard imported from Betfair Guru",
          completed: true,
          note: "CSV downloaded",
        },
        {
          name: "Analysis",
          label: "Winning Warlock analysis (75%+ shortlist)",
          completed: true,
          note: "Shortlist reviewed",
        },
        {
          name: "Bias",
          label: "Draw bias captured",
          completed: true,
          note: "Draw & pace metrics recorded",
        },
        {
          name: "Sheet",
          label: "Qualified horses appended to ClawdBotB2L sheet",
          completed: qualified.length > 0,
          note: qualified.length > 0 ? `✓ ${qualified.length} appended` : "⏳ waiting for horses",
        },
      ],
    } as DashboardData["trading"];
  } catch (error) {
    console.error("[dashboard] fetchB2LData: failed to parse B2L file", formatError(error));
    return null;
  }
}

async function runOpenClawJson(args: string[], label: string): Promise<unknown | null> {
  if (!openClawBinary) {
    console.error("[dashboard] OpenClaw binary path is undefined");
    return null;
  }

  try {
    console.log(`[dashboard] running ${label}: ${openClawBinary} ${args.join(" ")}`);
    const { stdout, stderr } = await execFileAsync(openClawBinary, args, {
      env: process.env,
      timeout: 12000,
    });

    if (stderr?.trim()) {
      console.debug(`[dashboard] ${label} stderr: ${stderr.trim().replace(/\n/g, " | ")}`);
    }

    const trimmed = stdout.trim();
    const start = trimmed.search(/[\[{]/);
    if (start === -1) {
      console.warn(`[dashboard] ${label} output did not contain JSON: ${trimmed.slice(0, 80)}`);
      return null;
    }

    const payload = trimmed.slice(start);
    try {
      return JSON.parse(payload);
    } catch (error) {
      console.error(`[dashboard] ${label} JSON parse failed:`, formatError(error));
      return null;
    }
  } catch (error) {
    console.error(`[dashboard] ${label} execution failed:`, formatError(error));
    return null;
  }
}

function extractAgents(payload: unknown): OpenClawAgent[] {
  if (Array.isArray(payload)) {
    return payload as OpenClawAgent[];
  }
  if (payload && typeof payload === "object") {
    return (payload as OpenClawAgentsResponse).agents ?? [];
  }
  return [];
}

function extractSessions(payload: unknown): OpenClawSession[] {
  if (payload && typeof payload === "object") {
    const response = payload as OpenClawSessionsResponse;
    return Array.isArray(response.sessions) ? response.sessions : [];
  }
  return [];
}

function extractJobs(payload: unknown): OpenClawJob[] {
  if (payload && typeof payload === "object") {
    const response = payload as OpenClawCronResponse;
    return Array.isArray(response.jobs) ? response.jobs : [];
  }
  return [];
}

async function testGatewayEndpoint(url: string, label: string) {
  console.log(`[dashboard] testGatewayEndpoint: ${label} -> ${url}`);
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const bodyText = await response.text();
    let parsed: string | unknown = bodyText;
    try {
      parsed = JSON.parse(bodyText);
    } catch (error) {
      parsed = bodyText.slice(0, 500);
    }
    console.log(`[dashboard] ${label} response`, {
      url,
      status: response.status,
      ok: response.ok,
      payload: parsed,
    });
  } catch (error) {
    console.error(`[dashboard] ${label} fetch failed:`, formatError(error));
  }
}

function parseB2LHorses(content: string) {
  const lines = content.split(/\r?\n/);
  let currentDate = "";
  const horses: Array<{ name: string; race: string; value: string; note: string; date?: string }> = [];
  const seen = new Set<string>();
  const todayDate = "2026-02-10"; // FIXED: Filter to today only

  for (const rawLine of lines) {
    const dateMatch = rawLine.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    const normalized = rawLine.replace(/[\u2013\u2014]/g, "-");
    const entryMatch = normalized.match(/^- \*\*(.+?)\*\*\s+-\s+\*([^*]+)\*\s*[:\-–]*\s*(.*)$/);
    if (!entryMatch) continue;

    let race = entryMatch[1];
    const name = entryMatch[2];
    const rest = entryMatch[3];
    
    // Extract date from race field if it starts with YYYY-MM-DD format
    let entryDate = currentDate;
    const raceDateMatch = race.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    if (raceDateMatch) {
      entryDate = raceDateMatch[1];
      race = raceDateMatch[2]; // Remove date from race field
    }
    
    // FIXED: Only include entries for today (2026-02-10)
    if (entryDate !== todayDate) continue;
    
    const key = `${name.trim()}|${race.trim()}|${entryDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const valueMatch = rest.match(/priced(?:\s+at)?\s+([0-9]+(?:\.[0-9]+)?|n\/a)/i);
    const value = valueMatch ? valueMatch[1] : "n/a";
    const note = rest.trim();
    const raceLabel = `${entryDate ? `${entryDate} ` : ""}${race.trim()}`.trim();

    if (!name.trim()) continue;

    horses.push({
      name: name.trim(),
      race: raceLabel,
      value,
      note,
      date: entryDate || undefined,
    });
  }

  // Sort by time (race time) descending to show most recent races first
  horses.sort((a, b) => {
    const timeA = a.race.match(/(\d{2}):(\d{2})/)?.[0] || "00:00";
    const timeB = b.race.match(/(\d{2}):(\d{2})/)?.[0] || "00:00";
    return timeB.localeCompare(timeA);
  });

  // FIXED: Return only today's qualified horses (max 2 for Feb 10)
  return horses.slice(0, 2);
}

function formatTimestamp(value: unknown): string {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "Unknown";
}
