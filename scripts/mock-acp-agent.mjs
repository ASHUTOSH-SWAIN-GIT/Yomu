#!/usr/bin/env node
// A minimal stand-in ACP agent used for the ACP spike test
// (src-tauri/tests/acp_spike.rs) and for manual smoke testing without a
// real Codex install. It speaks the small JSON-RPC-over-stdio protocol
// implemented in src-tauri/src/agent/rpc.rs and harness.rs:
//
//   -> initialize                  { protocolVersion }
//   <- result                      { protocolVersion, agentCapabilities: {} }
//   -> session/new                 { cwd }
//   <- result                      { sessionId }
//   -> session/prompt              { sessionId, prompt: [{ type: "text", text }] }
//   <- notification session/update { sessionId, update: { kind: "token", text } }  (repeated)
//   <- notification session/update { sessionId, update: { kind: "done" } }
//   <- result                      {} (prompt request resolves once the turn is done)
//
// This is NOT the real ACP wire format — it's this project's own minimal
// subset, chosen because a real `codex-acp` adapter isn't available in
// this dev sandbox (see ROADMAP.md M4 and src-tauri/src/agent/*.rs doc
// comments). Swap AGENT_COMMAND in harness.rs to point at a real adapter
// once one is available, and adjust this mock (or better, a real fixture)
// to match its actual message shapes.

import readline from "node:readline";

let sessionCounter = 0;
const sessions = new Set();

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, message) {
  send({ jsonrpc: "2.0", id, error: { code: -1, message } });
}

function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

async function handlePrompt(id, params) {
  const { sessionId, prompt } = params;
  if (!sessions.has(sessionId)) {
    respondError(id, "unknown session");
    return;
  }

  const text = prompt?.[0]?.text ?? "";
  const words = `You said: ${text}`.split(" ");

  for (const word of words) {
    notify("session/update", {
      sessionId,
      update: { kind: "token", text: word + " " },
    });
    // Small delay so a real client can observe incremental streaming
    // rather than getting everything in one microtask.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  notify("session/update", { sessionId, update: { kind: "done" } });
  respond(id, {});
}

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      respond(id, { protocolVersion: "1", agentCapabilities: {} });
      break;
    case "session/new": {
      const sessionId = `mock-session-${++sessionCounter}`;
      sessions.add(sessionId);
      respond(id, { sessionId });
      break;
    }
    case "session/prompt":
      void handlePrompt(id, params);
      break;
    default:
      if (id !== undefined) {
        respondError(id, `unknown method: ${method}`);
      }
  }
});
