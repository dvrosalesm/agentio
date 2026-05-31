# runner-control

Interactive REPL harness — queue messages to an agent and watch events.

```bash
npm run start              # mock agent (@dvrosalesm/agentio/mock)
npm run start -- codex     # CODEX_COMMAND
npm run start -- claude    # CLAUDE_COMMAND
npm run start -- cursor    # CURSOR_COMMAND (needs @cursor/sdk + CURSOR_API_KEY)
npm run start -- pi        # PI_COMMAND
```

REPL commands: `send <message>` · `quit`

From repo root: `npm run example`

Each run starts a **fresh task**. External agents log to `.temp/agent-<taskId>.log`.

See also: [`examples/say-hi`](../say-hi) for a minimal one-message script.
