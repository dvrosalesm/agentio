# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-30

### Added

- `createAgent()` harness API: spawn any agent CLI, register tools, watch events
- `agentio` CLI for agents: `status`, `log`, `recv`, `run`, `done`, `fail`
- Message queue with `steer` and `queue` modes (`agent.send()` / `agentio recv`)
- Tool registration with descriptions; tools execute via SQLite queue (sandbox-safe)
- Per-workspace store at `<cwd>/.agentio/store.db`
- `.agentio/system-prompt.txt` and `tools.json` written on `run()`
- `formatTaskEvent()` for harness logging
- Example harness: `examples/runner-control` (demo-agent + optional Codex)

### Notes

- Designed for headless agents (Codex `exec`, custom scripts). Interactive TUIs are not attached to the harness terminal.
- Legacy global unix-socket host API remains under `host.ts` (deprecated).

[0.1.0]: https://github.com/agentio-hq/agentio/releases/tag/v0.1.0
