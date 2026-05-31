import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  EventType,
  MessageMode,
  MessageRecord,
  TaskEvent,
  TaskRecord,
  TaskStatus,
  ToolCallRecord,
  ToolCallStatus,
} from "./types.js";
import { DEFAULT_STORE_PATH } from "./paths.js";

let shared: Database.Database | null = null;
let sharedPath: string | null = null;

export function openStore(path = DEFAULT_STORE_PATH): Database.Database {
  if (shared && sharedPath === path) return shared;
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  if (shared) shared.close();
  shared = db;
  sharedPath = path;
  return db;
}

export function closeStore(): void {
  shared?.close();
  shared = null;
  sharedPath = null;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id, id);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      mode TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_recv ON messages(task_id, status, mode, id);
    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      action TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tool_calls_pending ON tool_calls(task_id, status, id);
  `);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function now(): string {
  return new Date().toISOString();
}

export function insertTask(
  db: Database.Database,
  row: { id: string; workspace: string; meta?: Record<string, unknown> },
): TaskRecord {
  const t = now();
  const meta = JSON.stringify(row.meta ?? {});
  db.prepare(
    `INSERT INTO tasks (id, workspace, status, meta, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?)`,
  ).run(row.id, row.workspace, meta, t, t);
  return getTask(db, row.id)!;
}

export function getTask(db: Database.Database, id: string): TaskRecord | null {
  const row = db
    .prepare(
      `SELECT id, workspace, status, meta, created_at, updated_at FROM tasks WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        workspace: string;
        status: TaskStatus;
        meta: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    workspace: row.workspace,
    status: row.status,
    meta: JSON.parse(row.meta) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function setTaskStatus(
  db: Database.Database,
  taskId: string,
  status: TaskStatus,
): void {
  db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    now(),
    taskId,
  );
}

export function listTasks(
  db: Database.Database,
  status?: TaskStatus,
): TaskRecord[] {
  const sql = status
    ? `SELECT id, workspace, status, meta, created_at, updated_at FROM tasks WHERE status = ? ORDER BY updated_at DESC`
    : `SELECT id, workspace, status, meta, created_at, updated_at FROM tasks ORDER BY updated_at DESC`;
  const rows = (status
    ? db.prepare(sql).all(status)
    : db.prepare(sql).all()) as Array<{
    id: string;
    workspace: string;
    status: TaskStatus;
    meta: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    workspace: row.workspace,
    status: row.status,
    meta: JSON.parse(row.meta) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function appendEvent(
  db: Database.Database,
  taskId: string,
  type: EventType,
  payload: Record<string, unknown>,
): TaskEvent {
  touchTask(db, taskId);
  const createdAt = now();
  const result = db
    .prepare(
      `INSERT INTO events (task_id, type, payload, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(taskId, type, JSON.stringify(payload), createdAt);
  return {
    id: Number(result.lastInsertRowid),
    taskId,
    type,
    payload,
    createdAt,
  };
}

function touchTask(db: Database.Database, taskId: string): void {
  db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now(), taskId);
}

export function maxEventId(db: Database.Database, taskId: string): number {
  const row = db
    .prepare(`SELECT MAX(id) AS m FROM events WHERE task_id = ?`)
    .get(taskId) as { m: number | null } | undefined;
  return row?.m ?? 0;
}

/** Re-queue tool calls left `running` after a harness crash. */
export function resetStuckToolCalls(
  db: Database.Database,
  taskId: string,
): number {
  const result = db
    .prepare(
      `UPDATE tool_calls SET status = 'pending'
       WHERE task_id = ? AND status = 'running'`,
    )
    .run(taskId);
  return result.changes;
}

export function listEvents(
  db: Database.Database,
  taskId: string,
  since = 0,
): TaskEvent[] {
  const rows = db
    .prepare(
      `SELECT id, task_id, type, payload, created_at FROM events
       WHERE task_id = ? AND id > ? ORDER BY id ASC`,
    )
    .all(taskId, since) as Array<{
    id: number;
    task_id: string;
    type: EventType;
    payload: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
  }));
}

export function enqueueMessage(
  db: Database.Database,
  taskId: string,
  body: string,
  mode: MessageMode,
): MessageRecord {
  const createdAt = now();
  const result = db
    .prepare(
      `INSERT INTO messages (task_id, mode, body, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(taskId, mode, body, createdAt);
  const id = Number(result.lastInsertRowid);
  appendEvent(db, taskId, "message_enqueued", { messageId: id, mode, body });
  return {
    id,
    taskId,
    mode,
    body,
    status: "pending",
    createdAt,
  };
}

/** True once this process has emitted at least one status event (after boot cursor). */
export function hasBootstrappedAgent(
  db: Database.Database,
  taskId: string,
  sinceEventId: number,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM events
       WHERE task_id = ? AND type = 'status' AND id > ?
       LIMIT 1`,
    )
    .get(taskId, sinceEventId);
  return row != null;
}

/** Steer first, then queue FIFO. Marks delivered and emits message_delivered. */
export function claimNextMessage(
  db: Database.Database,
  taskId: string,
): MessageRecord | null {
  const row = db
    .prepare(
      `SELECT id, task_id, mode, body, status, created_at, delivered_at FROM messages
       WHERE task_id = ? AND status = 'pending'
       ORDER BY CASE mode WHEN 'steer' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
    )
    .get(taskId) as
    | {
        id: number;
        task_id: string;
        mode: MessageMode;
        body: string;
        status: string;
        created_at: string;
        delivered_at: string | null;
      }
    | undefined;
  if (!row) return null;

  const deliveredAt = now();
  db.prepare(
    `UPDATE messages SET status = 'delivered', delivered_at = ? WHERE id = ?`,
  ).run(deliveredAt, row.id);

  appendEvent(db, taskId, "message_delivered", {
    messageId: row.id,
    mode: row.mode,
    body: row.body,
  });

  return {
    id: row.id,
    taskId: row.task_id,
    mode: row.mode,
    body: row.body,
    status: "delivered",
    createdAt: row.created_at,
    deliveredAt,
  };
}

export function clearMessageQueue(db: Database.Database, taskId: string): number {
  const result = db
    .prepare(
      `UPDATE messages SET status = 'cancelled'
       WHERE task_id = ? AND mode = 'queue' AND status = 'pending'`,
    )
    .run(taskId);
  return result.changes;
}

export function newTaskId(): string {
  return `tsk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function enqueueToolCall(
  db: Database.Database,
  taskId: string,
  action: string,
  args: Record<string, unknown>,
): ToolCallRecord {
  const createdAt = now();
  const result = db
    .prepare(
      `INSERT INTO tool_calls (task_id, action, args, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(taskId, action, JSON.stringify(args), createdAt);
  return getToolCall(db, Number(result.lastInsertRowid))!;
}

export function getToolCall(
  db: Database.Database,
  id: number,
): ToolCallRecord | null {
  const row = db
    .prepare(
      `SELECT id, task_id, action, args, status, result, error, created_at, completed_at
       FROM tool_calls WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        task_id: string;
        action: string;
        args: string;
        status: ToolCallStatus;
        result: string | null;
        error: string | null;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    action: row.action,
    args: JSON.parse(row.args) as Record<string, unknown>,
    status: row.status,
    result: row.result != null ? (JSON.parse(row.result) as unknown) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

/** Harness claims the next pending tool call (FIFO). */
export function claimNextToolCall(
  db: Database.Database,
  taskId: string,
): ToolCallRecord | null {
  const row = db
    .prepare(
      `SELECT id FROM tool_calls
       WHERE task_id = ? AND status = 'pending'
       ORDER BY id ASC LIMIT 1`,
    )
    .get(taskId) as { id: number } | undefined;
  if (!row) return null;

  const updated = db
    .prepare(
      `UPDATE tool_calls SET status = 'running' WHERE id = ? AND status = 'pending'`,
    )
    .run(row.id);
  if (updated.changes === 0) return null;
  return getToolCall(db, row.id);
}

export function completeToolCall(
  db: Database.Database,
  id: number,
  ok: boolean,
  result?: unknown,
  error?: string,
): ToolCallRecord {
  const status = ok ? "done" : "failed";
  db.prepare(
    `UPDATE tool_calls SET status = ?, result = ?, error = ?, completed_at = ? WHERE id = ?`,
  ).run(
    status,
    ok ? JSON.stringify(result ?? null) : null,
    ok ? null : (error ?? "unknown"),
    now(),
    id,
  );
  return getToolCall(db, id)!;
}

/** Agent CLI blocks until the harness finishes the tool call. */
export async function waitForToolCall(
  db: Database.Database,
  id: number,
  timeoutMs = 120_000,
): Promise<ToolCallRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = getToolCall(db, id);
    if (!row) throw new Error(`Unknown tool call: ${id}`);
    if (row.status === "done" || row.status === "failed") return row;
    await sleepMs(100);
  }
  throw new Error(`Tool timed out after ${timeoutMs}ms`);
}
