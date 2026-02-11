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
  error?: string;
};

const candidatePaths = [
  path.join(process.cwd(), ".next", "server", "generated-data.json"),
  path.join(process.cwd(), "data", "generated-data.json"),
  path.join(os.homedir(), "clawd", "openclaw-dashboard", "data", "generated-data.json"),
];

async function getFileStatus(filePath: string): Promise<FileStatus> {
  try {
    const stat = await fs.stat(filePath);
    const raw = await fs.readFile(filePath, "utf-8");
    JSON.parse(raw);

    return {
      path: filePath,
      exists: true,
      valid: true,
      timestamp: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      path: filePath,
      exists: !message.includes("ENOENT"),
      valid: false,
      timestamp: null,
      sizeBytes: null,
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
