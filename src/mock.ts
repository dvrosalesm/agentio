import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const packageDir = dirname(fileURLToPath(import.meta.url));

/** argv to spawn the built-in mock agent (echo loop). Import from `@dvrosalesm/agentio/mock`. */
export const MOCK_COMMAND = ["node", join(packageDir, "mock-cli.js")] as const;

export interface MockMessageReply {
  reply: string;
  stop?: boolean;
}

export type MockMessageResult = string | MockMessageReply | null;

export type MockMessageHandler = (
  body: string,
) => MockMessageResult | Promise<MockMessageResult>;

export interface RunMockAgentOptions {
  /** @default "ready" */
  readyStatus?: string;
  /** @default echo body; stop on `quit` */
  onMessage?: MockMessageHandler;
}

function agentioBin(): string {
  return process.env.AGENTIO_BIN ?? "agentio";
}

async function agentio(...args: string[]): Promise<string> {
  const { stdout } = await run(agentioBin(), args, { env: process.env });
  return stdout.trim();
}

async function recvBody(): Promise<string> {
  while (true) {
    const raw = await agentio("recv");
    if (raw === "null") continue;
    return (JSON.parse(raw) as { body: string }).body;
  }
}

function defaultOnMessage(body: string): MockMessageResult {
  if (/^quit$/i.test(body.trim())) return null;
  return body;
}

function resolveReply(result: MockMessageResult): {
  reply: string;
  stop: boolean;
} | null {
  if (result === null) return null;
  if (typeof result === "string") return { reply: result, stop: false };
  return { reply: result.reply, stop: result.stop ?? false };
}

/** Run the mock agent in-process (uses `agentio` CLI via AGENTIO_BIN). */
export async function runMockAgent(
  options: RunMockAgentOptions = {},
): Promise<void> {
  const onMessage = options.onMessage ?? defaultOnMessage;
  await agentio("status", options.readyStatus ?? "ready");

  for (;;) {
    const body = await recvBody();
    const resolved = resolveReply(await onMessage(body));
    if (!resolved) break;
    await agentio("log", resolved.reply);
    if (resolved.stop) break;
  }

  await agentio("done", "bye");
}
