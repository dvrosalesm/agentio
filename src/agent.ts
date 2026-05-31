import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import type Database from "better-sqlite3";
import {
  appendEvent,
  claimNextToolCall,
  clearMessageQueue,
  completeToolCall,
  enqueueMessage,
  getTask,
  insertTask,
  listEvents,
  maxEventId,
  newTaskId,
  openStore,
  resetStuckToolCalls,
} from "./db.js";
import {
  envExports,
  resolveAgentioBin,
  resolveAgentStorePath,
} from "./paths.js";
import { writeHarnessFiles } from "./prompt.js";
import {
  readResumableSession,
  SESSION_VERSION,
  writeSession,
} from "./session.js";
import type {
  CreateAgentOptions,
  MessageMode,
  RunResult,
  SendOptions,
  TaskEvent,
  RegisteredTool,
  ToolHandler,
} from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class Agent extends EventEmitter {
  readonly storePath: string;
  private readonly db: Database.Database;
  private readonly options: CreateAgentOptions;
  private taskId: string | null = null;
  private child: ChildProcess | null = null;
  private debugLogStream: WriteStream | null = null;
  private watchGen = 0;
  private watchRunning = false;
  private readonly pendingTools = new Map<
    string,
    { description: string; handler: ToolHandler }
  >();

  constructor(options: CreateAgentOptions) {
    super();
    this.options = options;
    this.storePath = resolveAgentStorePath(options.cwd, options.storePath);
    this.db = openStore(this.storePath);
  }

  /** Harness → agent. Default mode is queue. */
  send(body: string, options: SendOptions = {}): number {
    const taskId = this.requireTask();
    const mode: MessageMode = options.mode ?? "queue";
    const msg = enqueueMessage(this.db, taskId, body, mode);
    return msg.id;
  }

  clearQueue(): number {
    return clearMessageQueue(this.db, this.requireTask());
  }

  registerTool(
    name: string,
    description: string,
    handler: ToolHandler,
  ): void {
    this.pendingTools.set(name, { description, handler });
  }

  /** Tools registered via registerTool (written to .agentio/system-prompt.txt on start()). */
  listTools(): RegisteredTool[] {
    return [...this.pendingTools.entries()].map(([name, tool]) => ({
      name,
      description: tool.description,
    }));
  }

  /** Whether `.agentio/session.json` points at an active task in this store. */
  async canResume(): Promise<boolean> {
    const manifest = readResumableSession(this.options.cwd, this.storePath);
    if (!manifest) return false;
    const task = getTask(this.db, manifest.taskId);
    return task?.status === "active";
  }

  /** New task, session manifest, spawn, and event watch. */
  async start(): Promise<RunResult> {
    if (this.child) {
      throw new Error("Agent already running");
    }

    const taskId = newTaskId();
    this.taskId = taskId;
    insertTask(this.db, {
      id: taskId,
      workspace: this.options.cwd,
      meta: { harness: this.options.harness, ...this.options.meta },
    });

    const tools = this.listTools();
    writeHarnessFiles(this.options.cwd, { registeredTools: tools });
    writeSession(this.options.cwd, {
      version: SESSION_VERSION,
      taskId,
      storePath: this.storePath,
      harness: this.options.harness,
      command: this.options.command,
      tools,
    });

    return this.spawnAndWatch(taskId, tools, 0);
  }

  /** Reattach to the last session, respawn the agent, tail new events only. */
  async resume(): Promise<RunResult> {
    if (this.child) {
      throw new Error("Agent already running");
    }

    const manifest = readResumableSession(this.options.cwd, this.storePath);
    if (!manifest) {
      throw new Error("No session to resume (.agentio/session.json missing or stale)");
    }

    const task = getTask(this.db, manifest.taskId);
    if (!task) {
      throw new Error(`Session task not found: ${manifest.taskId}`);
    }
    if (task.status !== "active") {
      throw new Error(`Session task is ${task.status}, not active`);
    }

    this.taskId = manifest.taskId;
    resetStuckToolCalls(this.db, manifest.taskId);

    const tools = this.listTools();
    writeHarnessFiles(this.options.cwd, { registeredTools: tools });
    writeSession(this.options.cwd, {
      ...manifest,
      tools,
      command: this.options.command,
    });

    const since = maxEventId(this.db, manifest.taskId);
    return this.spawnAndWatch(manifest.taskId, tools, since);
  }

  /** @deprecated Use `start()` */
  async run(): Promise<RunResult> {
    return this.start();
  }

  private spawnAndWatch(
    taskId: string,
    tools: RegisteredTool[],
    watchSince: number,
  ): RunResult {
    const [command, ...args] = this.options.command;
    if (!command) {
      throw new Error("createAgent({ command }) requires at least one argv entry");
    }

    const agentioBin = resolveAgentioBin(this.options.pathPrefix);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENTIO_TASK_ID: taskId,
      AGENTIO_STORE: this.storePath,
      AGENTIO_BIN: agentioBin,
    };
    if (this.options.pathPrefix) {
      env.PATH = `${this.options.pathPrefix}:${process.env.PATH ?? ""}`;
    }

    const debugLogPath = this.openDebugLog(taskId, command, args);
    const captureOutput = debugLogPath != null;

    this.child = spawn(command, args, {
      cwd: this.options.cwd,
      env,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "ignore",
    });

    if (captureOutput && this.debugLogStream) {
      const log = this.debugLogStream;
      this.child.stdout?.on("data", (chunk) => {
        log.write(`[stdout] ${chunk}`);
      });
      this.child.stderr?.on("data", (chunk) => {
        log.write(`[stderr] ${chunk}`);
      });
    }

    const pid = this.child.pid ?? 0;
    this.child.on("close", (code, signal) => {
      if (this.debugLogStream) {
        this.debugLogStream.write(
          `\n# exited code=${code ?? "?"}${signal ? ` signal=${signal}` : ""}\n`,
        );
        this.debugLogStream.end();
        this.debugLogStream = null;
      }
      this.child = null;
      this.emit("exit", { code: code ?? 0, signal });
    });

    this.startWatch(watchSince);

    return { taskId, pid, tools, debugLogPath };
  }

  private openDebugLog(
    taskId: string,
    command: string,
    args: string[],
  ): string | undefined {
    const opt = this.options.debugOutput;
    if (!opt) return undefined;

    const logPath =
      opt === true
        ? join(this.options.cwd, ".temp", `agent-${taskId}.log`)
        : opt.replace("{taskId}", taskId);

    mkdirSync(dirname(logPath), { recursive: true });

    this.debugLogStream = createWriteStream(logPath, { flags: "a" });
    this.debugLogStream.write(
      [
        `\n# ${new Date().toISOString()}`,
        `# command: ${[command, ...args].join(" ")}`,
        "",
      ].join("\n"),
    );
    return logPath;
  }

  async stop(): Promise<void> {
    this.watchGen++;
    this.watchRunning = false;

    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      this.child = null;
    }

    if (this.debugLogStream) {
      this.debugLogStream.write("\n# stopped by harness\n");
      this.debugLogStream.end();
      this.debugLogStream = null;
    }
  }

  get task(): string | null {
    return this.taskId;
  }

  env(): string {
    const taskId = this.requireTask();
    return envExports(taskId, {
      storePath: this.storePath,
      pathPrefix: this.options.pathPrefix,
      agentioBin: resolveAgentioBin(this.options.pathPrefix),
    });
  }

  private requireTask(): string {
    if (!this.taskId) {
      throw new Error("Call start() or resume() before using this agent session");
    }
    return this.taskId;
  }

  private async processToolCalls(taskId: string): Promise<void> {
    for (;;) {
      const call = claimNextToolCall(this.db, taskId);
      if (!call) return;

      const tool = this.pendingTools.get(call.action);
      if (!tool) {
        completeToolCall(
          this.db,
          call.id,
          false,
          undefined,
          `Unknown tool: ${call.action}`,
        );
        appendEvent(this.db, taskId, "tool_end", {
          action: call.action,
          error: `Unknown tool: ${call.action}`,
        });
        continue;
      }

      try {
        const result = await tool.handler(call.args, { taskId });
        completeToolCall(this.db, call.id, true, result);
        appendEvent(this.db, taskId, "tool_end", {
          action: call.action,
          result,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        completeToolCall(this.db, call.id, false, undefined, message);
        appendEvent(this.db, taskId, "tool_end", {
          action: call.action,
          error: message,
        });
      }
    }
  }

  private startWatch(since: number): void {
    const taskId = this.requireTask();
    const gen = ++this.watchGen;
    this.watchRunning = true;

    void (async () => {
      let cursor = since;
      while (this.watchRunning && gen === this.watchGen) {
        await this.processToolCalls(taskId);

        const batch = listEvents(this.db, taskId, cursor);
        for (const event of batch) {
          cursor = event.id;
          this.emit("event", event);
        }
        await sleep(200);
      }
    })();
  }
}

export function createAgent(options: CreateAgentOptions): Agent {
  return new Agent(options);
}
