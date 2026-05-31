#!/usr/bin/env node
import { execFile } from "node:child_process";
import { parseArgs, promisify } from "node:util";
import { runMockAgent } from "./mock.js";

const run = promisify(execFile);
const agentioBin = () => process.env.AGENTIO_BIN ?? "agentio";

async function agentio(...args: string[]): Promise<string> {
  const { stdout } = await run(agentioBin(), args, { env: process.env });
  return stdout.trim();
}

const { values } = parseArgs({
  options: {
    once: { type: "boolean", default: false },
    reply: { type: "string" },
  },
  allowPositionals: false,
});

const once = values.once === true;
const fixedReply = values.reply;

runMockAgent({
  onMessage(body) {
    if (/^quit$/i.test(body.trim())) return null;
    if (once) {
      return { reply: fixedReply ?? body, stop: true };
    }
    if (fixedReply != null) return fixedReply;
    return body;
  },
}).catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await agentio("fail", message);
  } catch {
    console.error(message);
  }
  process.exit(1);
});
