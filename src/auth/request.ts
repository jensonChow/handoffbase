import type { ApiKeyCallerConfig, AuthConfig, CallerContext } from "./types.js";
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

  const caller = resolveConfiguredCaller(config.apiKeys, apiKey);
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

function resolveConfiguredCaller(
  apiKeys: AuthConfig["apiKeys"],
  apiKey: string,
): ApiKeyCallerConfig | undefined {
  // Look up own properties only. `config.apiKeys` is a plain object, so a bare
  // `apiKeys[apiKey]` resolves inherited Object.prototype members
  // ("constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", ...)
  // to truthy values, which would let an attacker present one of those names as
  // an API key and bypass the invalid-key check. Also require a concrete
  // tenant/user so a malformed entry can never yield an unscoped caller whose
  // undefined scope matches every tenant's memories.
  if (!apiKeys || !Object.hasOwn(apiKeys, apiKey)) {
    return undefined;
  }
  const caller = apiKeys[apiKey];
  if (
    !caller
    || typeof caller.tenantId !== "string"
    || caller.tenantId.length === 0
    || typeof caller.userId !== "string"
    || caller.userId.length === 0
  ) {
    return undefined;
  }
  return caller;
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
