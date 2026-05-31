#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const bin = () => process.env.AGENTIO_BIN ?? "agentio";

async function agentio(...args: string[]): Promise<string> {
  const { stdout } = await run(bin(), args, { env: process.env });
  return stdout.trim();
}

async function waitForMessage(): Promise<string> {
  while (true) {
    const raw = await agentio("recv");
    if (raw === "null") continue;
    return (JSON.parse(raw) as { body: string }).body;
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is required for the Cursor SDK bridge");
  }

  const { Agent } = await import("@cursor/sdk");

  await agentio("status", "ready");

  await using cursor = await Agent.create({
    apiKey,
    model: { id: "composer-2.5" },
    local: { cwd: process.cwd() },
  });

  let body = await waitForMessage();
  while (!/^quit$/i.test(body.trim())) {
    const run = await cursor.send(body);
    const result = await run.wait();
    await agentio("log", result.result?.trim() || "(empty)");
    body = await waitForMessage();
  }

  await agentio("done", "bye");
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await agentio("fail", message);
  } catch {
    console.error(message);
  }
  process.exit(1);
});
