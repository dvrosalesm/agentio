#!/usr/bin/env node
import {
  appendEvent,
  claimNextMessage,
  enqueueToolCall,
  getTask,
  openStore,
  setTaskStatus,
  waitForToolCall,
} from "./db.js";
import { resolveStorePath, resolveTaskId } from "./paths.js";

function usage(): never {
  console.error(`Usage:
  agentio status <text>
  agentio log <text>
  agentio recv [--timeout <ms>]
  agentio run <tool> [--json '<object>']
  agentio done <summary>
  agentio fail <error>

Env: AGENTIO_TASK_ID, AGENTIO_STORE`);
  process.exit(2);
}

function parseArgs(argv: string[]): {
  cmd: string;
  positional: string[];
  json?: string;
  timeoutMs: number | null;
} {
  if (argv.length === 0) usage();
  const cmd = argv[0]!;
  const positional: string[] = [];
  let json: string | undefined;
  let timeoutMs: number | null = null;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") {
      json = argv[++i];
      continue;
    }
    if (a === "--timeout") {
      const v = argv[++i];
      timeoutMs = v === undefined ? 0 : Number(v);
      continue;
    }
    if (a.startsWith("--")) {
      console.error(`Unknown flag: ${a}`);
      usage();
    }
    positional.push(a);
  }

  return { cmd, positional, json, timeoutMs };
}

function requireTask(db: ReturnType<typeof openStore>, taskId: string): void {
  if (!getTask(db, taskId)) {
    console.error(`Unknown task: ${taskId}`);
    process.exit(1);
  }
}

async function waitForMessage(
  db: ReturnType<typeof openStore>,
  taskId: string,
  timeoutMs: number | null,
): Promise<void> {
  if (timeoutMs === 0) {
    const msg = claimNextMessage(db, taskId);
    if (!msg) {
      console.log("null");
      return;
    }
    console.log(JSON.stringify({ id: msg.id, mode: msg.mode, body: msg.body }));
    return;
  }

  const deadline =
    timeoutMs == null ? null : Date.now() + (Number.isNaN(timeoutMs) ? 0 : timeoutMs);

  while (true) {
    const msg = claimNextMessage(db, taskId);
    if (msg) {
      console.log(JSON.stringify({ id: msg.id, mode: msg.mode, body: msg.body }));
      return;
    }
    if (deadline != null && Date.now() >= deadline) {
      console.log("null");
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main(): Promise<void> {
  const { cmd, positional, json, timeoutMs } = parseArgs(process.argv.slice(2));
  const taskId = resolveTaskId();
  const db = openStore(resolveStorePath());
  requireTask(db, taskId);

  switch (cmd) {
    case "status": {
      const text = positional.join(" ").trim();
      if (!text) usage();
      appendEvent(db, taskId, "status", { text });
      return;
    }
    case "log": {
      const text = positional.join(" ").trim();
      if (!text) usage();
      appendEvent(db, taskId, "log", { text });
      return;
    }
    case "recv":
    case "message": {
      await waitForMessage(db, taskId, timeoutMs);
      return;
    }
    case "run": {
      const action = positional[0];
      if (!action) usage();
      let args: Record<string, unknown> = {};
      if (json) {
        try {
          args = JSON.parse(json) as Record<string, unknown>;
        } catch {
          console.error("Invalid --json payload");
          process.exit(1);
        }
      }
      appendEvent(db, taskId, "tool_start", { action, args });
      const call = enqueueToolCall(db, taskId, action, args);
      let finished;
      try {
        finished = await waitForToolCall(db, call.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendEvent(db, taskId, "tool_end", { action, error: message });
        console.error(message);
        process.exit(1);
      }
      if (finished.status === "failed") {
        console.error(finished.error ?? "Tool failed");
        process.exit(1);
      }
      console.log(JSON.stringify(finished.result ?? null));
      return;
    }
    case "done": {
      const summary = positional.join(" ").trim();
      if (!summary) usage();
      setTaskStatus(db, taskId, "done");
      appendEvent(db, taskId, "done", { summary });
      return;
    }
    case "fail": {
      const error = positional.join(" ").trim();
      if (!error) usage();
      setTaskStatus(db, taskId, "failed");
      appendEvent(db, taskId, "fail", { error });
      process.exit(1);
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
