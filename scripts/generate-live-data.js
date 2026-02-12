#!/usr/bin/env node

/**
 * Generate OpenClaw snapshot data.
 *
 * - On trusted machines/CI (with OpenClaw CLI), this writes a live snapshot.
 * - In constrained environments, it can write fallback placeholder data with metadata.
 * - If REQUIRE_LIVE_DATA=true, generation fails when live data is unavailable.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dashboardTemplate = require('../data/dashboard-data.json');

const openclawBinary = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');
const requireLiveData = String(process.env.REQUIRE_LIVE_DATA || '').toLowerCase() === 'true';

function createEmptySnapshot() {
  return {
    ...JSON.parse(JSON.stringify(dashboardTemplate)),
    agents: [],
    projects: {
      status: 'unavailable',
      active: [],
      recentActivity: [],
      activityLog: [],
    },
    content: {
      status: 'unavailable',
      items: [],
    },
    trading: {
      availability: 'unavailable',
      status: {
        dailyStatus: 'Unavailable',
        statusNote: 'Live trading data unavailable',
        completionStatus: 'No live data',
      },
      qualifiedHorses: [],
      tradingStats: {
        matchedRaces: 0,
        unmatched: 0,
        profit: 0,
        liability: 0,
      },
      pipelineStages: [],
    },
    crons: {
      status: 'unavailable',
      jobs: [],
    },
    calendar: {
      status: 'unavailable',
      events: [],
    },
    fileActivity: {
      status: 'unavailable',
      files: [],
    },
  };
}

function runCommand(cmd, label) {
  try {
    console.log(`[generate] Running: ${cmd}`);
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });

    const lines = output.trim().split('\n');
    let jsonStr = '';
    let inJson = false;
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inJson && (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
        inJson = true;
      }

      if (inJson) {
        jsonStr += `${line}\n`;
        for (const char of line) {
          if (char === '[' || char === '{') depth += 1;
          if (char === ']' || char === '}') depth -= 1;
        }
        if (depth === 0 && jsonStr.trim().length > 0) break;
      }
    }

    if (!jsonStr.trim()) {
      console.warn(`[generate] ${label}: No JSON found in output`);
      return null;
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn(`[generate] ${label} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function createMetadata({ isFallback, source, details }) {
  return {
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/generate-live-data.js',
    source,
    isFallback,
    details,
  };
}

function withMetadata(data, metadata) {
  return {
    ...data,
    metadata,
    __meta: metadata,
  };
}

function processAgents(agents, sessions) {
  const sessionsData = sessions?.sessions || [];

  return agents.map((agent) => {
    const prefix = `agent:${agent.id}:`;
    const agentSessions = sessionsData.filter((s) => typeof s.key === 'string' && s.key.startsWith(prefix));

    const tokens = agentSessions.reduce((total, session) => {
      const value = typeof session.totalTokens === 'number'
        ? session.totalTokens
        : session.outputTokens ?? 0;
      return total + (typeof value === 'number' ? value : Number(value) || 0);
    }, 0);

    return {
      name: agent.identityName || agent.id || 'Unknown',
      state: agentSessions.length > 0 ? 'Active' : 'Idle',
      sessions: agentSessions.length,
      tokens,
      cost: Number((tokens * 0.0000263).toFixed(4)),
      model: agent.model || 'anthropic/claude-haiku-4-5',
      tasks: [],
    };
  });
}

function processCrons(jobs) {
  return {
    status: 'available',
    jobs: jobs.map((job) => {
      const state = job.state ?? {};
      const name = job.name || job.payload?.name || job.payload?.text || job.id || 'Unnamed cron';
      const status = state.lastStatus || state.status || 'unknown';
      const nextRun = formatTimestamp(state.nextRunAtMs ?? state.next_run);
      const lastRun = formatTimestamp(state.lastRunAtMs ?? state.last_run ?? state.lastRun);

      return { name, status, nextRun, lastRun };
    }),
  };
}

function formatTimestamp(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) return new Date(value).toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return 'Unknown';
}

function generateData() {
  console.log('[generate] ========== generateData START ==========');
  console.log(`[generate] OpenClaw binary path: ${openclawBinary}`);

  if (!fs.existsSync(openclawBinary)) {
    const message = `OpenClaw binary not found at ${openclawBinary}`;
    if (requireLiveData) {
      throw new Error(`${message}. REQUIRE_LIVE_DATA=true prevents fallback snapshots.`);
    }

    console.warn(`[generate] ${message}`);
    console.warn('[generate] Writing fallback snapshot data.');
    return withMetadata(
      createEmptySnapshot(),
      createMetadata({
        isFallback: true,
        source: 'empty-fallback',
        details: 'openclaw binary unavailable; emitted empty snapshot',
      }),
    );
  }

  const data = createEmptySnapshot();

  console.log('[generate] Fetching agents and sessions...');
  const agents = runCommand(`${openclawBinary} agents list --json`, 'agents list');
  const sessions = runCommand(`${openclawBinary} sessions list --json`, 'sessions list');

  console.log('[generate] Fetching cron jobs...');
  const cronResponse = runCommand(`${openclawBinary} cron list --json`, 'cron list');

  const agentsReady = Boolean(agents && Array.isArray(agents) && agents.length > 0);
  const cronsReady = Boolean(cronResponse && Array.isArray(cronResponse.jobs));

  if (agentsReady) {
    data.agents = processAgents(agents, sessions);
    console.log(`[generate] ✓ Fetched ${data.agents.length} agents`);
  }

  if (cronsReady) {
    data.crons = processCrons(cronResponse.jobs);
    console.log(`[generate] ✓ Fetched ${data.crons.jobs.length} cron jobs`);
  }

  const isFallback = !(agentsReady && cronsReady);
  if (isFallback && requireLiveData) {
    throw new Error('Live snapshot incomplete (missing agents or crons). REQUIRE_LIVE_DATA=true prevents fallback snapshots.');
  }

  return withMetadata(
    data,
    createMetadata({
      isFallback,
      source: isFallback ? 'mixed' : 'openclaw-cli',
      details: isFallback
        ? 'partial live data; unresolved sections are empty'
        : 'live agents+sessions+cron captured from openclaw cli',
    }),
  );
}

const outputPath = path.join(__dirname, '../data/generated-data.json');
const snapshot = generateData();

fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf-8');
const stats = fs.statSync(outputPath);
console.log(`[generate] ✓ Data written to ${outputPath}`);
console.log(`[generate]   File size: ${stats.size} bytes`);
const emittedMeta = snapshot?.__meta || snapshot?.metadata;
console.log(`[generate]   Metadata: isFallback=${emittedMeta?.isFallback}, generatedAt=${emittedMeta?.generatedAt}`);
