#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [toolName, payloadPath] = process.argv.slice(2);

if (!toolName || !payloadPath) {
  console.error("Usage: npm run mcp:call -- <tool-name> <payload-json-file>");
  console.error("Example: MCP_ENDPOINT=https://example.com/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json");
  process.exit(1);
}

const endpoint = process.env.MCP_ENDPOINT || "http://localhost:3000/mcp";
const sessionId = process.env.MCP_SESSION_ID;
const authToken = process.env.MCP_AUTH_TOKEN;
const payload = JSON.parse(await readFile(payloadPath, "utf8"));

const body = {
  jsonrpc: "2.0",
  id: `manual-${Date.now()}`,
  method: "tools/call",
  params: {
    name: toolName,
    arguments: payload.arguments || payload
  }
};

const headers = {
  "content-type": "application/json",
  "accept": "application/json, text/event-stream"
};

if (sessionId) {
  headers["mcp-session-id"] = sessionId;
}

if (authToken) {
  headers.authorization = `Bearer ${authToken}`;
}

const response = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify(body)
});

const text = await response.text();
console.log(`HTTP ${response.status} ${response.statusText}`);
console.log(text);

if (!response.ok) {
  process.exit(1);
}
