/** @deprecated Use per-agent ToolHost via Agent.run() */
import type { ActionHandler, RunRequest, RunResponse } from "./types.js";
import { resolveSocketPath } from "./paths.js";
import { invokeTool, ToolHost } from "./tool-host.js";

const legacy = new ToolHost({ kind: "unix", path: resolveSocketPath() });
let legacyStarted = false;

export type StartHostOptions = { socketPath?: string };

export async function startHost(options: StartHostOptions = {}): Promise<{
  socketPath: string;
  close: () => Promise<void>;
}> {
  if (options.socketPath && options.socketPath !== legacy.socketPath) {
    const host = new ToolHost({ kind: "unix", path: options.socketPath });
    await host.start();
    return { socketPath: options.socketPath, close: () => host.stop() };
  }
  if (!legacyStarted) {
    await legacy.start();
    legacyStarted = true;
  }
  return { socketPath: legacy.socketPath, close: stopHost };
}

export async function stopHost(): Promise<void> {
  await legacy.stop();
  legacyStarted = false;
}

export function registerAction(name: string, handler: ActionHandler): void {
  legacy.register(name, handler);
}

export function unregisterAction(name: string): void {
  /* legacy host has no unregister — no-op */
}

export function listRegisteredActions(): string[] {
  return [];
}

export function invokeRunOverSocket(
  socketPath: string,
  request: RunRequest,
  timeoutMs?: number,
): Promise<RunResponse> {
  return invokeTool(socketPath, request, timeoutMs);
}
