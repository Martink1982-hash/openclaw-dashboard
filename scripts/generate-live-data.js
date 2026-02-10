#!/usr/bin/env node

/**
 * Generate live OpenClaw data for the dashboard
 * Runs before the Netlify build to capture current state
 * Falls back to placeholder data if commands fail
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const placeholderData = require('../data/dashboard-data.json');

function runCommand(cmd, label) {
  try {
    console.log(`[generate] Running: ${cmd}`);
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    
    // Find JSON in output (may have debug logs before it)
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
        jsonStr += line + '\n';
        // Count braces to find complete JSON
        for (const char of line) {
          if (char === '[' || char === '{') depth++;
          if (char === ']' || char === '}') depth--;
        }
        // If we've found complete JSON, stop
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

function generateData() {
  const openclawBinary = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');
  
  if (!fs.existsSync(openclawBinary)) {
    console.warn(`[generate] OpenClaw binary not found at ${openclawBinary}`);
    console.log('[generate] Using placeholder data');
    return placeholderData;
  }

  const data = JSON.parse(JSON.stringify(placeholderData));

  // Fetch agents and sessions
  console.log('[generate] Fetching agents and sessions...');
  const agents = runCommand(`${openclawBinary} agents list --json`, 'agents list');
  const sessions = runCommand(`${openclawBinary} sessions list --json`, 'sessions list');

  if (agents && agents.length) {
    data.agents = processAgents(agents, sessions);
    console.log(`[generate] ✓ Fetched ${data.agents.length} agents`);
  } else {
    console.log('[generate] ✗ Could not fetch agents, using placeholder');
  }

  // Fetch cron jobs
  console.log('[generate] Fetching cron jobs...');
  const cronResponse = runCommand(`${openclawBinary} cron list --json`, 'cron list');
  
  if (cronResponse && cronResponse.jobs) {
    data.crons = processCrons(cronResponse.jobs);
    console.log(`[generate] ✓ Fetched ${data.crons.jobs.length} cron jobs`);
  } else {
    console.log('[generate] ✗ Could not fetch cron jobs, using placeholder');
  }

  return data;
}

function processAgents(agents, sessions) {
  const sessionsData = sessions?.sessions || [];
  
  return agents.map(agent => {
    const prefix = `agent:${agent.id}:`;
    const agentSessions = sessionsData.filter(s => 
      typeof s.key === 'string' && s.key.startsWith(prefix)
    );
    
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
    jobs: jobs.map(job => {
      const state = job.state ?? {};
      const name = job.name || job.payload?.name || job.payload?.text || job.id || 'Unnamed cron';
      const status = state.lastStatus || state.status || 'unknown';
      const nextRun = formatTimestamp(state.nextRunAtMs ?? state.next_run);
      const lastRun = formatTimestamp(state.lastRunAtMs ?? state.last_run ?? state.lastRun);

      return {
        name,
        status,
        nextRun,
        lastRun,
      };
    }),
  };
}

function formatTimestamp(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return 'Unknown';
}

// Main execution
const outputPath = path.join(__dirname, '../data/generated-data.json');
const liveData = generateData();

fs.writeFileSync(outputPath, JSON.stringify(liveData, null, 2), 'utf-8');
console.log(`[generate] ✓ Data written to ${outputPath}`);
console.log('[generate] Note: Post-build step (copy-data-to-build.js) will copy this to .next/server/ after Next.js builds');
console.log('[generate] Done!');
