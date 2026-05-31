import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export const HARNESS_BOOTSTRAP =
  'Read .agentio/system-prompt.txt. First: agentio status "ready". ' +
  'Then repeat: agentio recv → agentio log "<reply>". ' +
  "Always log a reply after each recv. Never call agentio done until the user sends quit.";

export const CODEX_COMMAND = [
  "codex",
  "exec",
  "--sandbox",
  "workspace-write",
  HARNESS_BOOTSTRAP,
];

export const CLAUDE_COMMAND = ["claude", "-p", HARNESS_BOOTSTRAP];

export const PI_COMMAND = ["pi", "-p", HARNESS_BOOTSTRAP];

/** Requires @cursor/sdk and CURSOR_API_KEY. */
export const CURSOR_COMMAND = ["node", join(dir, "cursor-bridge.js")];
