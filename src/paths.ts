import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_STORE_DIR = join(homedir(), ".agentio");
export const DEFAULT_STORE_PATH = join(DEFAULT_STORE_DIR, "store.db");
export const DEFAULT_SOCKET_PATH = join(DEFAULT_STORE_DIR, "host.sock");

export function resolveStorePath(explicit?: string): string {
  return (explicit ?? process.env.AGENTIO_STORE ?? DEFAULT_STORE_PATH).trim();
}

/** Per-workspace store (writable inside Codex/sandbox workdirs). */
export function storePathForWorkspace(cwd: string): string {
  return join(cwd, ".agentio", "store.db");
}

export function resolveAgentStorePath(cwd: string, explicit?: string): string {
  return (explicit ?? process.env.AGENTIO_STORE ?? storePathForWorkspace(cwd)).trim();
}

/** @deprecated legacy global unix socket */
export function resolveSocketPath(explicit?: string): string {
  return (explicit ?? process.env.AGENTIO_SOCKET ?? DEFAULT_SOCKET_PATH).trim();
}

/** @deprecated use TCP tool endpoint via resolveToolEndpoint */
export function socketPathForTask(taskId: string, storePath?: string): string {
  const base = storePath ? dirname(storePath) : DEFAULT_STORE_DIR;
  return join(base, "agents", `${taskId}.sock`);
}

export function resolveTaskId(): string {
  const id = process.env.AGENTIO_TASK_ID?.trim();
  if (!id) {
    throw new Error("AGENTIO_TASK_ID is not set");
  }
  return id;
}

/** Event id floor for this agent process; recv waits for a newer status before delivering. */
export function resolveBootCursor(): number {
  const raw = process.env.AGENTIO_BOOT_CURSOR?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveAgentioBin(pathPrefix?: string): string {
  if (pathPrefix?.trim()) {
    for (const dir of pathPrefix.split(":")) {
      const candidate = join(dir.trim(), "agentio");
      if (existsSync(candidate)) return candidate;
    }
  }
  return "agentio";
}

export interface EnvExportsOptions {
  storePath?: string;
  pathPrefix?: string;
  agentioBin?: string;
  bootCursor?: number;
}

export function envExports(
  taskId: string,
  options: EnvExportsOptions = {},
): string {
  const store = resolveStorePath(options.storePath);
  const agentioBin =
    options.agentioBin ?? resolveAgentioBin(options.pathPrefix);
  const bootCursor = options.bootCursor ?? 0;
  const lines = [
    `export AGENTIO_TASK_ID=${taskId}`,
    `export AGENTIO_STORE=${store}`,
    `export AGENTIO_BIN=${agentioBin}`,
    `export AGENTIO_BOOT_CURSOR=${bootCursor}`,
  ];

  if (options.pathPrefix?.trim()) {
    lines.push(`export PATH="${options.pathPrefix}:$PATH"`);
  }
  return lines.join("\n");
}
