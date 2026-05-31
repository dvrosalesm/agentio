#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgent, formatTaskEvent, type TaskEvent } from "@agentio/core";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(exampleDir, "../..");

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function agentioBinPath(): string | undefined {
  const bins = [
    join(repoRoot, "node_modules", ".bin"),
    join(exampleDir, "node_modules", ".bin"),
  ].filter(existsSync);
  return bins.length ? bins.join(":") : undefined;
}

function agentioBinCommand(): string {
  const pathPrefix = agentioBinPath();
  if (pathPrefix) {
    for (const dir of pathPrefix.split(":")) {
      const candidate = join(dir, "agentio");
      if (existsSync(candidate)) return candidate;
    }
  }
  return "agentio";
}

function defaultCommand(): string[] {
  const tsx = join(exampleDir, "node_modules", ".bin", "tsx");
  const script = join(exampleDir, "demo-agent.ts");
  if (existsSync(tsx)) return [tsx, script];
  return ["node", script];
}

/** Headless: bare `codex` → `codex exec` (no interactive TUI). */
function normalizeCommand(command: string[]): string[] {
  const [bin, ...rest] = command;
  if (bin === "codex" && rest[0] !== "exec") {
    return [
      "codex",
      "exec",
      [
        "You are on an agentio harness. Read .agentio/system-prompt.txt.",
        `First shell command (required): ${agentioBinCommand()} status "codex connected".`,
        "User messages are NOT in chat — only via agentio recv (JSON).",
        "Loop: status -> work -> recv when waiting on user -> until agentio done.",
      ].join(" "),
    ];
  }
  return command;
}

function formatCommand(command: string[]): string {
  if (command[0] === "codex" && command[1] === "exec") {
    return "codex exec";
  }
  return command.join(" ");
}

function resolveCommand(): string[] {
  const raw = process.argv[2]?.trim() || process.env.AGENTIO_COMMAND?.trim();
  if (raw) return normalizeCommand(raw.split(/\s+/));
  if (process.env.AGENT_COMMAND) {
    return normalizeCommand(process.env.AGENT_COMMAND.split(/\s+/));
  }
  return defaultCommand();
}

async function main(): Promise<void> {
  const command = resolveCommand();
  log(`agent: ${formatCommand(command)}\n`);

  const agent = createAgent({
    harness: "runner-control",
    cwd: process.cwd(),
    command,
    pathPrefix: agentioBinPath(),
    debugOutput: true,
  });

  agent.registerTool(
    "search_files",
    "Search the workspace by glob and return matching file paths.",
    async (args) => ({
      glob: String(args.glob ?? "**/*"),
      files: [],
    }),
  );

  agent.registerTool(
    "super_tool",
    "Super Tool — fake harness tool that always succeeds (for testing).",
    async (args) => ({
      tool: "super tool",
      ok: true,
      input: args,
      result: "Super Tool executed successfully.",
    }),
  );

  agent.on("event", (ev: TaskEvent) => {
    // Harness already prints "queued message #N" on send.
    if (ev.type === "message_enqueued") return;
    log(formatTaskEvent(ev));
  });

  agent.on("exit", ({ code, signal }) => {
    if (code !== 0 || signal) {
      log(
        `agent process ended (code=${code}${signal ? ` signal=${signal}` : ""}). ` +
          "For codex auth errors run: codex logout && codex login",
      );
    }
  });

  const resumed = await agent.canResume();
  const started = resumed ? await agent.resume() : await agent.start();
  log(`${resumed ? "resumed" : "started"} task ${started.taskId} pid ${started.pid}`);
  const { taskId, tools, debugLogPath } = started;
  if (tools.length) {
    log(
      `tools → ${tools.map((t) => t.name).join(", ")} (described in .agentio/system-prompt.txt)`,
    );
  }
  if (debugLogPath) log(`agent output → ${debugLogPath}\n`);
  else log("");
  log("Harness: send <text> | steer <text> | clear | stop | quit\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => {
    rl.setPrompt("harness> ");
    rl.prompt();
  };

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    const [cmd, ...rest] = trimmed.split(/\s+/);
    const text = rest.join(" ").trim();

    switch (cmd) {
      case "send":
        if (!text) log("Usage: send <message>");
        else {
          const id = agent.send(text);
          log(`queued message #${id}`);
        }
        break;
      case "steer":
        if (!text) log("Usage: steer <message>");
        else {
          const id = agent.send(text, { mode: "steer" });
          log(`steer message #${id}`);
        }
        break;
      case "clear":
        log(`cleared ${agent.clearQueue()} queued message(s)`);
        break;
      case "stop":
        rl.close();
        await agent.stop();
        process.exit(0);
        return;
      case "quit":
      case "q":
      case "exit":
        rl.close();
        await agent.stop();
        process.exit(0);
        return;
      default:
        log("Commands: send | steer | clear | stop | quit");
    }
    prompt();
  });

  prompt();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
