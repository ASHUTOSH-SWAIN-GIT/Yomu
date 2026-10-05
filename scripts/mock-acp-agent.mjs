#!/usr/bin/env node
// Stand-in ACP agent for the Rust tests (src-tauri/src/agent/tests.rs), so
// CI needs no Codex install. It speaks the subset of real ACP the app
// uses, with the message shapes observed from @agentclientprotocol/codex-acp:
//
//   initialize / session/new / session/resume / session/set_mode
//   session/prompt -> session/update { update: { sessionUpdate: "agent_message_chunk", content } }
//                     then a result { stopReason: "end_turn" }
//
// A prompt containing "PERMISSION" makes the mock ask the client for a
// permission first (a request *from* agent to client), and it replies with
// the client's outcome, so the default-deny path can be asserted.

import readline from "node:readline";

let sessionCounter = 0;
const sessions = new Map(); // sessionId -> modeId
const models = new Map(); // sessionId -> modelId
let requestCounter = 0;
const pendingClientReplies = new Map();
const cancelled = new Set();

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const respond = (id, result) => send({ jsonrpc: "2.0", id, result });
const respondError = (id, message) =>
  send({ jsonrpc: "2.0", id, error: { code: -1, message } });
const notify = (method, params) => send({ jsonrpc: "2.0", method, params });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function askClient(method, params) {
  const id = `agent-${++requestCounter}`;
  return new Promise((resolve) => {
    pendingClientReplies.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });
}

async function handlePrompt(id, { sessionId, prompt }) {
  if (!sessions.has(sessionId)) return respondError(id, "unknown session");

  const text = prompt?.[0]?.text ?? "";
  let reply = `You said: ${text}`;
  // Report attached images so tests can assert the wire format.
  const image = (prompt ?? []).find((part) => part.type === "image");
  if (image) reply += ` [image ${image.mimeType} ${image.data?.length}]`;

  if (text.includes("PERMISSION")) {
    const answer = await askClient("session/request_permission", {
      sessionId,
      toolCall: { toolCallId: "t1", title: "write a file" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    });
    reply = `permission outcome: ${answer?.result?.outcome?.outcome}`;
  }
  // Like a plan that does not allow some models: the retired default always
  // fails, and "REJECT_MODEL" makes the model that replaced it fail too.
  const model = models.get(sessionId) ?? "";
  const modelName = model.split("[")[0];
  if (
    modelName === "retired" ||
    text.includes("REJECT_ALL") ||
    (text.includes("REJECT_MODEL") && modelName === "current")
  ) {
    return respondError(
      id,
      `The '${modelName}' model is not supported when using Codex with a ChatGPT account.`,
    );
  }
  if (text.includes("SHOW_MODEL")) reply = `model ${model}`;
  if (text.includes("USAGE_LIMIT")) {
    return respondError(id, "You've hit your usage limit");
  }

  // "SLOW" gives a test time to cancel mid-stream.
  const words = text.includes("SLOW")
    ? Array(200).fill("word")
    : reply.split(" ");
  for (const word of words) {
    if (cancelled.delete(sessionId))
      return respond(id, { stopReason: "cancelled" });
    notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: word + " " },
      },
    });
    await sleep(text.includes("SLOW") ? 20 : 5);
  }
  cancelled.delete(sessionId);
  respond(id, { stopReason: "end_turn" });
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = message;

  // A response to something the mock asked the client.
  if (method === undefined && pendingClientReplies.has(id)) {
    pendingClientReplies.get(id)(message);
    pendingClientReplies.delete(id);
    return;
  }

  switch (method) {
    case "initialize":
      respond(id, { protocolVersion: 1, agentCapabilities: {} });
      break;
    case "session/new": {
      const sessionId = `mock-session-${++sessionCounter}`;
      sessions.set(sessionId, "agent"); // like Codex: NOT read-only by default
      // Like Codex, the session starts on the model from the user's config,
      // which here is one the account does not offer.
      models.set(sessionId, "retired[low]");
      respond(id, {
        sessionId,
        models: {
          currentModelId: "retired[low]",
          availableModels: [
            { modelId: "current[low]" },
            { modelId: "backup[low]" },
          ],
        },
      });
      break;
    }
    case "session/resume":
      if (sessions.has(params.sessionId)) respond(id, {});
      else respondError(id, "session not found");
      break;
    case "session/set_mode":
      if (!sessions.has(params.sessionId)) respondError(id, "unknown session");
      else {
        sessions.set(params.sessionId, params.modeId);
        respond(id, {});
      }
      break;
    case "session/set_model":
      if (!sessions.has(params.sessionId)) respondError(id, "unknown session");
      else {
        models.set(params.sessionId, params.modelId);
        respond(id, {});
      }
      break;
    case "session/cancel":
      cancelled.add(params.sessionId); // a notification: no response
      break;
    case "session/prompt":
      // Refuse to run unless locked down, so tests catch a missing set_mode.
      if (sessions.get(params.sessionId) !== "read-only") {
        respondError(id, "session is not read-only");
      } else {
        void handlePrompt(id, params);
      }
      break;
    default:
      if (id !== undefined) respondError(id, `unknown method: ${method}`);
  }
});
