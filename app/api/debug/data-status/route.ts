import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

type FileStatus = {
  path: string;
  exists: boolean;
  valid: boolean;
  timestamp: string | null;
  sizeBytes: number | null;
  isFallback: boolean | null;
  generatedAt: string | null;
  ageHours: number | null;
  rejectionReasons: string[];
  error?: string;
};

const PRE_GENERATED_MAX_AGE_HOURS = 24;

const candidatePaths = [
  path.join(process.cwd(), ".next", "server", "generated-data.json"),
  path.join(process.cwd(), "data", "generated-data.json"),
  path.join(os.homedir(), "clawd", "openclaw-dashboard", "data", "generated-data.json"),
];

async function getFileStatus(filePath: string): Promise<FileStatus> {
  try {
    const stat = await fs.stat(filePath);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      metadata?: { isFallback?: boolean; generatedAt?: string };
      __meta?: { isFallback?: boolean; generatedAt?: string };
      agents?: unknown;
      crons?: { jobs?: unknown };
      projects?: { status?: unknown };
    };

    const rejectionReasons: string[] = [];

    const meta = parsed.__meta ?? parsed.metadata;
    const metaSource = parsed.__meta ? "__meta" : parsed.metadata ? "metadata" : "none";
    if (!meta || typeof meta !== "object") {
      rejectionReasons.push("Missing metadata block (__meta or metadata)");
    }

    const isFallback = typeof meta?.isFallback === "boolean" ? meta.isFallback : null;
    if (isFallback === null) {
      rejectionReasons.push(`Missing ${metaSource}.isFallback`);
    } else if (isFallback) {
      rejectionReasons.push(`Expected ${metaSource}.isFallback === false, got true`);
    }

    const generatedAt = typeof meta?.generatedAt === "string" ? meta.generatedAt : null;
    if (!generatedAt) {
      rejectionReasons.push(`Missing ${metaSource}.generatedAt`);
    }

    let ageHours: number | null = null;
    if (generatedAt) {
      const generatedTime = new Date(generatedAt).getTime();
      if (!Number.isFinite(generatedTime)) {
        rejectionReasons.push(`Invalid ${metaSource}.generatedAt timestamp: ${generatedAt}`);
      } else {
        ageHours = (Date.now() - generatedTime) / (1000 * 60 * 60);
        if (ageHours > PRE_GENERATED_MAX_AGE_HOURS) {
          rejectionReasons.push(
            `Snapshot is stale (${ageHours.toFixed(2)}h old, max ${PRE_GENERATED_MAX_AGE_HOURS}h)`,
          );
        }
      }
    }

    if (!Array.isArray(parsed.agents)) {
      rejectionReasons.push("Missing or invalid agents array");
    }

    if (!parsed.crons || typeof parsed.crons !== "object" || !Array.isArray(parsed.crons.jobs)) {
      rejectionReasons.push("Missing or invalid crons.jobs array");
    }

    const projectsStatus = parsed.projects?.status;
    if (
      projectsStatus !== undefined
      && (typeof projectsStatus !== "string" || projectsStatus.trim().length === 0)
    ) {
      rejectionReasons.push("Invalid projects.status (must be a non-empty string when present)");
    }

    return {
      path: filePath,
      exists: true,
      valid: rejectionReasons.length === 0,
      timestamp: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      isFallback,
      generatedAt,
      ageHours,
      rejectionReasons,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      path: filePath,
      exists: !message.includes("ENOENT"),
      valid: false,
      timestamp: null,
      sizeBytes: null,
      isFallback: null,
      generatedAt: null,
      ageHours: null,
      rejectionReasons: ["File not readable or JSON parse failed"],
      error: message,
    };
  }
}

export async function GET() {
  const entries = await Promise.all(
    candidatePaths.map(async (filePath) => [filePath, await getFileStatus(filePath)] as const),
  );

  const fileStatus = Object.fromEntries(entries);

  const newestFile = Object.entries(fileStatus)
    .filter(([, status]) => status.exists && status.valid)
    .sort((entryA, entryB) => {
      const [, statusA] = entryA;
      const [, statusB] = entryB;
      const timeA = statusA.timestamp ? new Date(statusA.timestamp).getTime() : 0;
      const timeB = statusB.timestamp ? new Date(statusB.timestamp).getTime() : 0;
      return timeB - timeA;
    })[0]?.[0] ?? null;

  return NextResponse.json({
    candidatePaths,
    fileStatus,
    newestFile,
  });
}
