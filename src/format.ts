import type { TaskEvent } from "./types.js";

export function formatTaskEvent(ev: TaskEvent): string {
  const p = ev.payload;
  switch (ev.type) {
    case "status":
      return `[agentio] status: ${p.text}`;
    case "log":
      return `[agentio] log: ${p.text}`;
    case "message_enqueued":
      return `[harness] enqueued (${p.mode}): ${p.body}`;
    case "message_delivered":
      return `[agent] recv (${p.mode}): ${p.body}`;
    case "tool_start":
      return `[agentio] run ${p.action} ${JSON.stringify(p.args ?? {})}`;
    case "tool_end":
      return p.error
        ? `[agentio] run failed: ${p.error}`
        : `[agentio] run ok: ${JSON.stringify(p.result ?? null)}`;
    case "done":
      return `[agentio] done: ${p.summary}`;
    case "fail":
      return `[agentio] fail: ${p.error}`;
    default:
      return `[agentio] ${ev.type}: ${JSON.stringify(p)}`;
  }
}
