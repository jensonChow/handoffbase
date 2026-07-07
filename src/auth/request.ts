import type { AuthConfig, CallerContext } from "./types.js";
import { AuthError } from "./types.js";
import { DEFAULT_DISABLED_CALLER } from "./config.js";

export interface HeaderReader {
  get?(name: string): string | undefined;
  headers?: Record<string, string | string[] | undefined>;
}

export function resolveCallerContext(request: HeaderReader, config: AuthConfig): CallerContext {
  if (config.mode === "disabled") {
    return config.disabledCaller ?? DEFAULT_DISABLED_CALLER;
  }

  const apiKey = extractApiKey(request);
  if (!apiKey) {
    throw new AuthError("Missing Handoffbase API key.", {
      statusCode: 401,
      code: "handoffbase_auth_missing_api_key",
    });
  }

  const caller = config.apiKeys?.[apiKey];
  if (!caller) {
    throw new AuthError("Invalid Handoffbase API key.", {
      statusCode: 401,
      code: "handoffbase_auth_invalid_api_key",
    });
  }

  return {
    tenantId: caller.tenantId,
    userId: caller.userId,
    actorType: caller.actorType ?? "mcp_host",
    actorId: caller.actorId ?? caller.userId,
    allowedAgentProfileIds: caller.allowedAgentProfileIds,
    allowedProjectIds: caller.allowedProjectIds,
    authMode: "api_key",
  };
}

function extractApiKey(request: HeaderReader): string | undefined {
  const authorization = readHeader(request, "authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    return bearer;
  }

  return readHeader(request, "x-handoffbase-api-key")?.trim() || undefined;
}

function readHeader(request: HeaderReader, name: string): string | undefined {
  const fromGetter = request.get?.(name);
  if (fromGetter) {
    return fromGetter;
  }

  const headers = request.headers;
  if (!headers) {
    return undefined;
  }
  const item = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(item)) {
    return item[0];
  }
  return item;
}
