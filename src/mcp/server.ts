import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "../config.js";
import { createDefaultMemoryService } from "../services/continuity-memory-service.js";
import type { MemoryService } from "../services/memory-service.js";
import { registerContinuityMcp } from "./registry.js";

export function createContinuityMcpServer(service: MemoryService = createDefaultMemoryService()): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Remote Streamable HTTP MCP server for portable persistent agent memory with governed recall, remember, reflect, forget, and trace tools.",
    },
  );

  registerContinuityMcp(server, service);

  return server;
}
