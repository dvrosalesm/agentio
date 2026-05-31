#!/usr/bin/env node
import { createAgent, formatTaskEvent } from "@dvrosalesm/agentio";
import {
  agentCommand,
  debugLogHint,
  externalAgent,
  pathPrefix,
  runRepl,
} from "./helpers.js";

async function main(): Promise<void> {
  const agent = createAgent({
    harness: "example",
    cwd: process.cwd(),
    command: agentCommand(),
    pathPrefix,
    debugOutput: externalAgent(),
  });

  let showEvents = false;
  agent.on("event", (ev) => {
    if (!showEvents || ev.type === "message_enqueued") return;
    console.log(formatTaskEvent(ev));
  });

  await agent.start();

  console.log(debugLogHint());
  console.log("waiting for agent…");
  await agent.waitUntilReady();
  console.log(" ok\nready — send <msg> | quit\n");

  showEvents = true;
  await runRepl(agent);
  await agent.stop();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
