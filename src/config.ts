export const SERVER_NAME = "handoffbase-mcp-server";
export const SERVER_VERSION = "0.1.0";
export const SERVER_TRANSPORT = "streamable-http";

export interface ServerConfig {
  host: string;
  port: number;
  mcpPath: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: readOptionalEnv(env.HOST) ?? "127.0.0.1",
    port: parsePort(readOptionalEnv(env.PORT) ?? "3000"),
    mcpPath: parseMcpPath(readOptionalEnv(env.MCP_PATH) ?? "/mcp"),
  };
}

export function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new ConfigError("PORT must be a whole number between 0 and 65535.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError("PORT must be a whole number between 0 and 65535.");
  }

  return port;
}

export function parseMcpPath(value: string): string {
  if (!value.startsWith("/")) {
    throw new ConfigError("MCP_PATH must start with '/'.");
  }

  return value;
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
