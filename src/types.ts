export type TaskStatus = "active" | "done" | "failed";

export type MessageMode = "steer" | "queue";

export type EventType =
  | "status"
  | "log"
  | "tool_start"
  | "tool_end"
  | "done"
  | "fail"
  | "message_enqueued"
  | "message_delivered";

export interface TaskRecord {
  id: string;
  workspace: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MessageRecord {
  id: number;
  taskId: string;
  mode: MessageMode;
  body: string;
  status: "pending" | "delivered" | "cancelled";
  createdAt: string;
  deliveredAt?: string;
}

export interface CreateTaskOptions {
  workspace: string;
  meta?: Record<string, unknown>;
  id?: string;
}

export interface WatchOptions {
  since?: number;
  pollMs?: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: { taskId: string },
) => Promise<unknown> | unknown;

/** @deprecated use ToolHandler */
export type ActionHandler = ToolHandler;

export interface RegisteredTool {
  name: string;
  description: string;
}

export interface CreateAgentOptions {
  harness: string;
  cwd: string;
  /** argv for spawn, e.g. ["claude"] or ["codex"] */
  command: string[];
  storePath?: string;
  meta?: Record<string, unknown>;
  /** Prepended to PATH for agentio CLI */
  pathPrefix?: string;
  /**
   * Capture child stdout/stderr to a file (not the harness tty).
   * `true` → `<cwd>/.temp/agent-<taskId>.log`
   */
  debugOutput?: boolean | string;
}

export interface SendOptions {
  /** @default "queue" */
  mode?: MessageMode;
}

export type ToolCallStatus = "pending" | "running" | "done" | "failed";

export interface ToolCallRecord {
  id: number;
  taskId: string;
  action: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RunResult {
  taskId: string;
  pid: number;
  /** Tools passed to registerTool before start() — also written to .agentio/system-prompt.txt */
  tools: RegisteredTool[];
  /** Set when `debugOutput` was enabled on createAgent */
  debugLogPath?: string;
}

export interface RunRequest {
  taskId: string;
  action: string;
  args: Record<string, unknown>;
}

export interface RunResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}
