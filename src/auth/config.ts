import { MEMORY_ACTOR_TYPES, type MemoryActorType } from "@handoffbase/memory-core";
import type { ApiKeyCallerConfig, AuthConfig, AuthMode, CallerContext } from "./types.js";

const DEFAULT_TENANT_ID = "demo-tenant";
const DEFAULT_USER_ID = "demo-user";
const DEFAULT_ACTOR_ID = "disabled-auth";
const DEFAULT_ACTOR_TYPE: MemoryActorType = "mcp_host";

export const DEFAULT_DISABLED_CALLER: CallerContext = {
  tenantId: DEFAULT_TENANT_ID,
  userId: DEFAULT_USER_ID,
  actorType: DEFAULT_ACTOR_TYPE,
  actorId: DEFAULT_ACTOR_ID,
  authMode: "disabled",
};

export function authConfigFromEnv(env: Record<string, string | undefined> = process.env): AuthConfig {
  const mode = parseAuthMode(env.HANDOFFBASE_AUTH_MODE);
  if (mode === "disabled") {
    return {
      mode,
      disabledCaller: DEFAULT_DISABLED_CALLER,
    };
  }

  return {
    mode,
    apiKeys: {
      ...parseApiKeysJson(env.HANDOFFBASE_API_KEYS_JSON),
      ...parseSingleApiKey(env),
    },
    disabledCaller: DEFAULT_DISABLED_CALLER,
  };
}

function parseAuthMode(value: string | undefined): AuthMode {
  const normalized = value?.trim() || "disabled";
  if (normalized === "disabled" || normalized === "api_key") {
    return normalized;
  }
  throw new Error(`Unsupported HANDOFFBASE_AUTH_MODE: ${normalized}`);
}

function parseApiKeysJson(value: string | undefined): Record<string, ApiKeyCallerConfig> {
  if (!value?.trim()) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("HANDOFFBASE_API_KEYS_JSON must be a JSON object keyed by API key.");
  }

  const entries = Object.entries(parsed).map(([apiKey, caller]) => [apiKey, parseCallerConfig(caller, apiKey)] as const);
  return Object.fromEntries(entries);
}

function parseSingleApiKey(env: Record<string, string | undefined>): Record<string, ApiKeyCallerConfig> {
  const apiKey = env.HANDOFFBASE_API_KEY?.trim();
  if (!apiKey) {
    return {};
  }

  return {
    [apiKey]: {
      tenantId: requireEnv(env.HANDOFFBASE_TENANT_ID, "HANDOFFBASE_TENANT_ID"),
      userId: requireEnv(env.HANDOFFBASE_USER_ID, "HANDOFFBASE_USER_ID"),
      actorType: parseActorType(env.HANDOFFBASE_ACTOR_TYPE, "HANDOFFBASE_ACTOR_TYPE") ?? DEFAULT_ACTOR_TYPE,
      actorId: env.HANDOFFBASE_ACTOR_ID?.trim() || env.HANDOFFBASE_USER_ID?.trim() || "api-key",
      allowedAgentProfileIds: parseListEnv(env.HANDOFFBASE_ALLOWED_AGENT_PROFILE_IDS),
      allowedProjectIds: parseListEnv(env.HANDOFFBASE_ALLOWED_PROJECT_IDS),
    },
  };
}

function parseCallerConfig(value: unknown, apiKey: string): ApiKeyCallerConfig {
  if (!isRecord(value)) {
    throw new Error(`API key config for ${apiKey} must be an object.`);
  }

  const tenantId = readString(value, "tenantId") ?? readString(value, "tenant_id");
  const userId = readString(value, "userId") ?? readString(value, "user_id");
  if (!tenantId) {
    throw new Error(`API key config for ${apiKey} is missing tenantId.`);
  }
  if (!userId) {
    throw new Error(`API key config for ${apiKey} is missing userId.`);
  }

  return {
    tenantId,
    userId,
    actorType:
      parseActorType(readString(value, "actorType") ?? readString(value, "actor_type"), `API key config for ${apiKey}`) ??
      DEFAULT_ACTOR_TYPE,
    actorId: readString(value, "actorId") ?? readString(value, "actor_id") ?? userId,
    allowedAgentProfileIds:
      readStringList(value, "allowedAgentProfileIds") ?? readStringList(value, "allowed_agent_profile_ids"),
    allowedProjectIds: readStringList(value, "allowedProjectIds") ?? readStringList(value, "allowed_project_ids"),
  };
}

function parseActorType(value: string | undefined, source: string): MemoryActorType | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  if ((MEMORY_ACTOR_TYPES as readonly string[]).includes(value)) {
    return value as MemoryActorType;
  }
  throw new Error(`${source} has unsupported actorType: ${value}`);
}

function parseListEnv(value: string | undefined): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return normalizeStringList(value.split(","));
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readStringList(value: Record<string, unknown>, key: string): string[] | undefined {
  const item = value[key];
  if (typeof item === "string") {
    return normalizeStringList(item.split(","));
  }
  if (Array.isArray(item)) {
    return normalizeStringList(item);
  }
  return undefined;
}

function normalizeStringList(items: unknown[]): string[] | undefined {
  const output = [...new Set(items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return output.length > 0 ? output : undefined;
}

function requireEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required when HANDOFFBASE_API_KEY is set.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
