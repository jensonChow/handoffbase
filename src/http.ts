import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express, Response } from "express";
import type { Server as NodeHttpServer } from "node:http";
import { createContinuityMcpServer } from "./mcp/server.js";
import { createDefaultMemoryService } from "./services/continuity-memory-service.js";
import type { MemoryService } from "./services/memory-service.js";

export interface HttpAppOptions {
  allowedHosts?: string[];
  host?: string;
  mcpPath?: string;
  service?: MemoryService;
}

export interface HttpServerOptions extends HttpAppOptions {
  port?: number;
}

export interface StartedHttpServer {
  server: NodeHttpServer;
  url: string;
}

export function createHttpApp(options: HttpAppOptions = {}): Express {
  const host = options.host ?? "127.0.0.1";
  const mcpPath = options.mcpPath ?? "/mcp";
  const service = options.service ?? createDefaultMemoryService();
  const app = createMcpExpressApp({ host, allowedHosts: options.allowedHosts });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: "handoffbase-mcp-server",
      transport: "streamable-http",
      mcpPath,
    });
  });

  app.post(mcpPath, async (req, res) => {
    const mcpServer = createContinuityMcpServer(service);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.get(mcpPath, (_req, res) => methodNotAllowed(res));
  app.delete(mcpPath, (_req, res) => methodNotAllowed(res));

  return app;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<StartedHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const mcpPath = options.mcpPath ?? "/mcp";
  const app = createHttpApp({ ...options, host, mcpPath });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        url: `http://${hostForUrl(host)}:${actualPort}${mcpPath}`,
      });
    });
    server.once("error", reject);
  });
}

function methodNotAllowed(res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
}

function hostForUrl(host: string): string {
  if (host === "0.0.0.0") {
    return "127.0.0.1";
  }
  if (host === "::") {
    return "[::1]";
  }
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }
  return host;
}
