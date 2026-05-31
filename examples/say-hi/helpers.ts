import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAUDE_COMMAND,
  CODEX_COMMAND,
  CURSOR_COMMAND,
  PI_COMMAND,
} from "@dvrosalesm/agentio";
import { MOCK_COMMAND } from "@dvrosalesm/agentio/mock";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "node_modules", ".bin");

export const pathPrefix = existsSync(join(bin, "agentio")) ? bin : undefined;

const AGENTS = {
  codex: CODEX_COMMAND,
  claude: CLAUDE_COMMAND,
  cursor: CURSOR_COMMAND,
  pi: PI_COMMAND,
} as const;

export type AgentName = keyof typeof AGENTS;

export function agentName(): AgentName | undefined {
  const name = process.argv[2];
  return name && name in AGENTS ? (name as AgentName) : undefined;
}

export function agentCommand(): string[] {
  const name = agentName();
  if (name) return [...AGENTS[name]];
  return [...MOCK_COMMAND, "--once", "--reply", "Hi!"];
}

export function externalAgent(): boolean {
  return agentName() != null;
}

export function debugLogHint(): string | undefined {
  if (!externalAgent()) return undefined;
  return `(agent log → ${join(process.cwd(), ".temp")}/agent-*.log)`;
}
