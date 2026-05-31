import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RegisteredTool } from "./types.js";

export const AGENTIO_SYSTEM_PROMPT = `You are connected to an agentio harness.

There is NO direct chat with the harness. User text is NOT in your context until you run agentio recv.
To talk to the harness, use only the agentio CLI ($AGENTIO_BIN or "agentio" on PATH).

Outbound (you → harness):
- agentio status "<short progress>"
- agentio log "<detail>"
- agentio run <tool> --json '{"key":"value"}'
- agentio done "<summary>" when finished
- agentio fail "<reason>" on hard failure

Inbound (harness → you):
- agentio recv   (blocks until the user sends a message; steer or queue)
  Steer messages are delivered before queued ones. Call recv when you need user input.
  recv will not deliver until you have sent at least one agentio status for this process.

Env: AGENTIO_TASK_ID, AGENTIO_STORE, AGENTIO_BOOT_CURSOR (and AGENTIO_BIN when set). Tools run via the DB queue (agentio run). Do not invent APIs.`;

export function buildSystemPrompt(registeredTools: RegisteredTool[] = []): string {
  if (registeredTools.length === 0) return AGENTIO_SYSTEM_PROMPT;
  const toolLines = registeredTools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  return `${AGENTIO_SYSTEM_PROMPT}

Harness tools registered for this session (call with agentio run <name> --json '<object>'):
${toolLines}`;
}

export interface WriteHarnessFilesOptions {
  registeredTools?: RegisteredTool[];
}

export function writeHarnessFiles(
  workspace: string,
  options: WriteHarnessFilesOptions | RegisteredTool[] = [],
): string {
  const opts = Array.isArray(options)
    ? { registeredTools: options }
    : options;
  const registeredTools = opts.registeredTools ?? [];
  const dir = join(workspace, ".agentio");
  mkdirSync(dir, { recursive: true });
  const promptPath = join(dir, "system-prompt.txt");
  writeFileSync(promptPath, buildSystemPrompt(registeredTools), "utf8");
  if (registeredTools.length > 0) {
    writeFileSync(
      join(dir, "tools.json"),
      `${JSON.stringify(registeredTools, null, 2)}\n`,
      "utf8",
    );
  }
  return promptPath;
}
