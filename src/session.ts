import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RegisteredTool } from "./types.js";

export const SESSION_VERSION = 1;

export interface AgentSessionManifest {
  version: typeof SESSION_VERSION;
  taskId: string;
  storePath: string;
  harness: string;
  command: string[];
  tools: RegisteredTool[];
}

export function sessionFilePath(cwd: string): string {
  return join(cwd, ".agentio", "session.json");
}

export function writeSession(cwd: string, manifest: AgentSessionManifest): void {
  const dir = join(cwd, ".agentio");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    sessionFilePath(cwd),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

export function readResumableSession(
  cwd: string,
  expectedStorePath: string,
): AgentSessionManifest | null {
  const path = sessionFilePath(cwd);
  if (!existsSync(path)) return null;

  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as AgentSessionManifest;
    if (raw.version !== SESSION_VERSION) return null;
    if (!raw.taskId?.trim()) return null;
    if (resolve(raw.storePath) !== resolve(expectedStorePath)) return null;
    if (!Array.isArray(raw.command) || raw.command.length === 0) return null;
    return raw;
  } catch {
    return null;
  }
}
