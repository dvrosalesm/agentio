# Runner control

Uses `createAgent` from `@agentio/core`. Default agent is `demo-agent.ts` (loops on `agentio recv`).

```bash
npm run example
```

Optional (`codex login` first). Spawns `codex exec` with the agentio system prompt — Codex must run `agentio recv` / `status` itself (see `.agentio/system-prompt.txt`):

```bash
npm run example -- codex
```

Register tools with `agent.registerTool()` before `run()` — they are listed in `.agentio/system-prompt.txt` for the agent (e.g. `search_files`, `super_tool`).

While the agent runs:

- `send hello` — queue a message (agent gets it on next `agentio recv`)
- `steer stop now` — steer (delivered before queue)
- `clear` — `clearQueue()`
- `stop` / `quit` — kill agent + teardown
