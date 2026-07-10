import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express, Response } from "express";
import type { Server as NodeHttpServer } from "node:http";
import { authConfigFromEnv } from "./auth/config.js";
import { resolveCallerContext } from "./auth/request.js";
import { AuthError, type AuthConfig } from "./auth/types.js";
import { SERVER_NAME, SERVER_TRANSPORT, SERVER_VERSION } from "./config.js";
import { createContinuityMcpServer } from "./mcp/server.js";
import {
  createMemoryRuntime,
  type MemoryRuntime,
  type MemoryRuntimeOptions,
} from "./runtime/memory-runtime.js";
import { createDefaultMemoryService } from "./services/continuity-memory-service.js";
import { withCallerContext, type MemoryService, type MemoryServiceRuntimeInfo } from "./services/memory-service.js";

export interface HttpAppOptions {
  allowedHosts?: string[];
  authConfig?: AuthConfig;
  host?: string;
  mcpPath?: string;
  service?: MemoryService;
}

export interface HttpServerOptions extends HttpAppOptions, MemoryRuntimeOptions {
  port?: number;
}

export interface StartedHttpServer {
  server: NodeHttpServer;
  url: string;
  close(): Promise<void>;
}

export function createHttpApp(options: HttpAppOptions = {}): Express {
  const host = options.host ?? "127.0.0.1";
  const mcpPath = options.mcpPath ?? "/mcp";
  const service = options.service ?? createDefaultMemoryService();
  const authConfig = options.authConfig ?? authConfigFromEnv();
  const runtime = runtimeInfoForService(service);
  const app = createMcpExpressApp({ host, allowedHosts: options.allowedHosts });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: SERVER_TRANSPORT,
      mcpPath,
      authMode: authConfig.mode,
      providerMode: runtime.providerMode,
      storeMode: runtime.storeMode,
    });
  });

  app.post(mcpPath, async (req, res) => {
    let caller;
    try {
      caller = resolveCallerContext(req, authConfig);
    } catch (error) {
      if (error instanceof AuthError) {
        writeJsonRpcError(res, error.statusCode, -32001, error.message);
        return;
      }
      throw error;
    }

    const mcpServer = createContinuityMcpServer(withCallerContext(service, caller));
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
    } catch {
      console.error("Error handling MCP request.");
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
  const runtime: MemoryRuntime = options.service
    ? { service: options.service, close: async () => undefined }
    : createMemoryRuntime(options);

  try {
    const app = createHttpApp({ ...options, host, mcpPath, service: runtime.service });
    const server = await listen(app, port, host);
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;

    return {
      server,
      url: `http://${hostForUrl(host)}:${actualPort}${mcpPath}`,
      close: createServerCloser(server, runtime),
    };
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

function listen(app: Express, port: number, host: string): Promise<NodeHttpServer> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const server = app.listen(port, host, () => {
      server.off("error", onError);
      resolve(server);
    });
    server.once("error", onError);
  });
}

function createServerCloser(server: NodeHttpServer, runtime: MemoryRuntime): () => Promise<void> {
  let closePromise: Promise<void> | undefined;
  return () => {
    closePromise ??= (async () => {
      try {
        await closeNodeHttpServer(server);
      } finally {
        await runtime.close();
      }
    })();
    return closePromise;
  };
}

async function closeNodeHttpServer(server: NodeHttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function methodNotAllowed(res: Response): void {
  writeJsonRpcError(res, 405, -32000, "Method not allowed.");
}

function writeJsonRpcError(res: Response, statusCode: number, code: number, message: string): void {
  res.status(statusCode).json({
    jsonrpc: "2.0",
    error: {
      code,
      message,
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

function runtimeInfoForService(service: MemoryService): MemoryServiceRuntimeInfo {
  return service.getRuntimeInfo?.() ?? {
    providerMode: "custom",
    storeMode: "custom",
  };
}
