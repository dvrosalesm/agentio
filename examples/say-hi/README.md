# say-hi

Minimal harness — spawn an agent, send one message, wait for the `log` event, exit.

Uses `@dvrosalesm/agentio/mock` by default (`--once --reply Hi!`). No REPL, no polling loop.

```bash
npm run start              # mock agent
npm run start -- codex     # CODEX_COMMAND
npm run start -- claude    # CLAUDE_COMMAND
npm run start -- cursor    # CURSOR_COMMAND (needs @cursor/sdk + CURSOR_API_KEY)
npm run start -- pi        # PI_COMMAND
```

From repo root: `npm run example:say-hi`

Each run starts a **fresh task**. External agents log to `.temp/agent-<taskId>.log`.

See also: [`examples/runner-control`](../runner-control) for an interactive REPL.
