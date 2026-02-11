import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * DEBUG ENDPOINT: /api/debug/data-status
 * 
 * Shows the current state of data loading:
 * - Which files exist and their sizes
 * - OpenClaw binary location
 * - Data pipeline status
 * - Recommendations for fixing data loading issues
 * 
 * Example usage:
 * curl http://localhost:3000/api/debug/data-status
 */

export async function GET() {
  console.log("[debug] GET /api/debug/data-status");
  
  const openClawBinary = path.join(os.homedir(), ".openclaw", "bin", "openclaw");
  const homeDir = os.homedir();
  
  const candidatePaths = [
    {
      name: "Netlify production build",
      path: path.join(process.cwd(), ".next", "server", "generated-data.json"),
    },
    {
      name: "Local dev / post-build copy",
      path: path.join(process.cwd(), "data", "generated-data.json"),
    },
    {
      name: "Home directory fallback",
      path: path.join(homeDir, "clawd", "openclaw-dashboard", "data", "generated-data.json"),
    },
  ];

  const fileStatus: Record<string, {
    exists: boolean;
    size?: number;
    timestamp?: string;
    valid?: boolean;
    error?: string;
  }> = {};

  for (const { name, path: filePath } of candidatePaths) {
    try {
      const stat = await fs.stat(filePath);
      fileStatus[name] = {
        exists: true,
        size: stat.size,
        timestamp: stat.mtime.toISOString(),
      };

      // Try to parse to check if valid JSON
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const data = JSON.parse(content);
        fileStatus[name].valid = true;
      } catch (error) {
        fileStatus[name].valid = false;
        fileStatus[name].error = error instanceof Error ? error.message : String(error);
      }
    } catch (error) {
      fileStatus[name] = {
        exists: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Check OpenClaw binary
  let openClawStatus = {
    available: false,
    path: openClawBinary,
  };
  try {
    await fs.access(openClawBinary);
    openClawStatus.available = true;
  } catch (error) {
    // Binary doesn't exist
  }

  const status = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || "development",
      cwd: process.cwd(),
      homeDir,
    },
    openClaw: openClawStatus,
    dataFiles: fileStatus,
    recommendations: getRecommendations(fileStatus, openClawStatus),
  };

  console.log("[debug] Status endpoint returning:", JSON.stringify(status, null, 2));
  return NextResponse.json(status, { status: 200 });
}

function getRecommendations(
  fileStatus: Record<string, { exists: boolean; valid?: boolean }>,
  openClawStatus: { available: boolean }
): string[] {
  const recommendations: string[] = [];

  // Check if any valid data files exist
  const hasValidData = Object.values(fileStatus).some(f => f.exists && f.valid !== false);

  if (!hasValidData) {
    recommendations.push(
      "❌ No valid data files found. The dashboard is showing placeholder data."
    );
    recommendations.push(
      "📋 To fix this, run: npm run generate-data && npm run build"
    );
  } else {
    recommendations.push(
      "✓ Valid data file found. The dashboard should be showing real data."
    );
  }

  if (!openClawStatus.available) {
    recommendations.push(
      "⚠️ OpenClaw binary not found. Live data fetching is not available."
    );
    recommendations.push(
      `  Expected location: ${openClawStatus.path}`
    );
    recommendations.push(
      "  This is normal on Netlify. Ensure pre-generated data is used instead."
    );
  } else {
    recommendations.push(
      "✓ OpenClaw binary is available. Can fetch live data if needed."
    );
  }

  // Check for stale data
  const newestFile = Object.entries(fileStatus)
    .filter(([_, status]) => status.exists && status.valid)
    .sort(([_, a], [_, b]) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    })
    .at(0);

  if (newestFile) {
    const fileTime = new Date(newestFile[1].timestamp || "").getTime();
    const now = Date.now();
    const ageHours = (now - fileTime) / (1000 * 60 * 60);

    if (ageHours > 24) {
      recommendations.push(
        `⏰ Data is ${Math.round(ageHours)} hours old. Consider regenerating with: npm run generate-data`
      );
    } else {
      recommendations.push(
        `✓ Data is fresh (${Math.round(ageHours)} hours old)`
      );
    }
  }

  return recommendations;
}
