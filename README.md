# agentio

Slim harness between your UI and any agent CLI (Codex, Claude Code, custom scripts).

Your harness owns the process, tools, and user message queue. The agent talks back only through the **`agentio` CLI** and a workspace-local SQLite store — no chat pipe, no MCP required.

## Install

```bash
npm install @dvrosalesm/agentio
```

Requires **Node.js 20+**. Native dependency: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (prebuilt binaries on common platforms).

## Quick start (harness)

```ts
import { createAgent, formatTaskEvent } from "@dvrosalesm/agentio";
import { MOCK_COMMAND } from "@dvrosalesm/agentio/mock";
// import { CODEX_COMMAND } from "@dvrosalesm/agentio";

const agent = createAgent({
  harness: "my-ui",
  cwd: process.cwd(),
  command: [...MOCK_COMMAND], // or ["tsx", "my-agent.ts"], or CODEX_COMMAND
  pathPrefix: "node_modules/.bin",
});

agent.registerTool(
  "search_code",
  "Search the codebase and return matching locations.",
  async (args) => ({ hits: [], query: args.q }),
);

agent.on("event", (ev) => console.log(formatTaskEvent(ev)));

if (await agent.canResume()) {
  await agent.resume();
} else {
  await agent.start();
}

agent.send("Focus on tests first");
agent.send("Stop — wrong approach", { mode: "steer" });

await agent.stop();
```

## Agent protocol (`agentio` CLI)

The spawned agent receives `AGENTIO_TASK_ID`, `AGENTIO_STORE`, and `AGENTIO_BIN`. It should read `.agentio/system-prompt.txt` in `cwd`.

| Command | Purpose |
|---------|---------|
| `agentio status "<text>"` | Short progress to the harness |
| `agentio log "<text>"` | Detail / transcript snippets |
| `agentio recv` | Block until harness sends a message (JSON) |
| `agentio run <tool> --json '{...}'` | Invoke a harness-registered tool |
| `agentio done "<summary>"` | Mark task finished |
| `agentio fail "<error>"` | Mark task failed |

`recv` options:

- Default: block until a message arrives
- `--timeout 0`: poll once, print `null` or JSON
- `--timeout <ms>`: wait up to N ms

## Messages (harness → agent)

| API | Behavior |
|-----|----------|
| `agent.send(body)` | Queue (FIFO) |
| `agent.send(body, { mode: "steer" })` | Delivered before any queued message; does not clear the queue |
| `agent.clearQueue()` | Cancel pending queue messages |

Events: `message_enqueued`, `message_delivered`, plus `status`, `log`, `tool_start`, `tool_end`, `done`, `fail`.

User text is **not** injected into the agent’s chat context — only visible after `agentio recv`.

## Tools (harness → agent)

Register before `run()`:

```ts
agent.registerTool(
  "super_tool",
  "Does something awesome.",
  async (args, { taskId }) => ({ ok: true, taskId, args }),
);
```

Tool names and descriptions are written to `.agentio/system-prompt.txt`. Invocations use a **SQLite queue** (`tool_calls` table) so sandboxes (e.g. Codex) never need socket/TCP access to the harness.

## Workspace layout

After `start()` or `resume()` in `cwd`:

```text
.agentio/
  store.db           # tasks, events, messages, tool_calls
  session.json       # last session (for canResume / resume)
  system-prompt.txt  # agent instructions + tool list
  tools.json         # machine-readable tool registry
.temp/               # optional debug log (debugOutput: true)
  agent-<taskId>.log
```

## Mock agent (testing)

For harness tests and examples, use the optional mock subpath — it is **not** included in the main export (tree-shakeable):

```ts
import { MOCK_COMMAND, runMockAgent } from "@dvrosalesm/agentio/mock";
```

| Export | Purpose |
|--------|---------|
| `MOCK_COMMAND` | Spawn argv — echo loop via `agentio-mock` CLI |
| `runMockAgent(options?)` | Run the mock in-process (uses `AGENTIO_BIN`) |

CLI flags (`agentio-mock`): `--once`, `--reply <text>` (see `examples/say-hi`).

```ts
// one-shot reply
command: [...MOCK_COMMAND, "--once", "--reply", "Hi!"]

// custom handler in-process
await runMockAgent({
  onMessage(body) {
    if (/^quit$/i.test(body.trim())) return null;
    return body;
  },
});
```

## Examples

From the repo:

```bash
npm install
npm run build
npm run example:say-hi         # spawn → send → wait for reply → exit (mock)
npm run example                # interactive REPL (mock)
npm run example -- codex       # REPL with Codex (requires `codex login`)
```

- [`examples/say-hi`](./examples/say-hi) — minimal one-message flow
- [`examples/runner-control`](./examples/runner-control) — REPL harness (`send hello` · `quit`)

## Codex / sandbox notes

- Use **`codex exec`** (or a script), not the interactive TUI — the harness keeps stdin.
- Codex defaults to **read-only** sandbox; agentio must write to `.agentio/store.db`. Use `CODEX_COMMAND` (includes `--sandbox workspace-write`) or pass the flag yourself.
- Store and tools must live under **`cwd`** (default: `<cwd>/.agentio/store.db`).
- Set `pathPrefix` so `agentio` is on the child’s `PATH`, or set `AGENTIO_BIN` to an absolute path.

## API exports

- **Primary:** `createAgent`, `Agent`, `formatTaskEvent`
- **Agent spawn:** `CODEX_COMMAND`, `CLAUDE_COMMAND`, `CURSOR_COMMAND`, `PI_COMMAND`, `HARNESS_BOOTSTRAP`
- **Mock (optional):** `@dvrosalesm/agentio/mock` — `MOCK_COMMAND`, `runMockAgent` (bin: `agentio-mock`)
- **Prompt helpers:** `AGENTIO_SYSTEM_PROMPT`, `buildSystemPrompt`, `writeHarnessFiles`
- **Store:** `openStore`, `resolveAgentStorePath`, `storePathForWorkspace`
- **Legacy (deprecated):** `startHost`, `registerAction`, unix-socket `invokeRunOverSocket`

## License

MIT — see [LICENSE](./LICENSE).
