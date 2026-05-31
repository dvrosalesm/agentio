#!/usr/bin/env node
import { createAgent, type Agent, type TaskEvent } from "@dvrosalesm/agentio";
import {
  agentCommand,
  debugLogHint,
  externalAgent,
  pathPrefix,
} from "./helpers.js";

function waitForAgentLog(agent: Agent): Promise<string> {
  return new Promise((resolve) => {
    const onEvent = (ev: TaskEvent) => {
      if (ev.type !== "log") return;
      agent.off("event", onEvent);
      resolve(String(ev.payload.text ?? ""));
    };
    agent.on("event", onEvent);
  });
}

async function main(): Promise<void> {
  const agent = createAgent({
    harness: "say-hi",
    cwd: process.cwd(),
    command: agentCommand(),
    pathPrefix,
    debugOutput: externalAgent(),
  });

  await agent.start();

  const hint = debugLogHint();
  if (hint) console.log(hint);
  console.log("waiting for agent…");
  await agent.waitUntilReady();
  console.log(" ok");

  const replyPromise = waitForAgentLog(agent);
  console.log("sending: say hi");
  agent.send("say hi");

  const reply = await replyPromise;
  console.log(`agent: ${reply}`);

  await agent.stop();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
