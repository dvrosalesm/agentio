#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function agentio(...argv: string[]): Promise<string> {
  const { stdout } = await execFileAsync("agentio", argv, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function main(): Promise<void> {
  await agentio("status", "demo-agent ready");
  await agentio("log", "blocking on agentio recv");

  for (;;) {
    const raw = await agentio("recv");
    if (raw === "null") continue;

    const msg = JSON.parse(raw) as { id: number; mode: string; body: string };
    await agentio(
      "status",
      `got #${msg.id} (${msg.mode}): ${msg.body.slice(0, 120)}`,
    );

    if (/^(quit|exit|stop)$/i.test(msg.body.trim())) {
      await agentio("done", "demo-agent exiting");
      return;
    }
  }
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
