import { redactSensitiveText } from "../sensitive.js";

export interface ProviderInputSanitizerOptions {
  maxArrayLength?: number;
  maxDepth?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
}

interface SanitizerConfig {
  maxArrayLength: number;
  maxDepth: number;
  maxObjectKeys: number;
  maxStringLength: number;
}

const DEFAULT_SANITIZER_CONFIG: SanitizerConfig = {
  maxArrayLength: 50,
  maxDepth: 12,
  maxObjectKeys: 80,
  maxStringLength: 4_000
};

const REDACTED_SENSITIVE_VALUE = "[REDACTED_SENSITIVE_VALUE]";
const TRUNCATED_ARRAY_KEY = "__truncated_array_items__";
const TRUNCATED_OBJECT_KEY = "__truncated_object_keys__";

const SENSITIVE_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "bearertoken",
  "clientsecret",
  "client_secret",
  "cookie",
  "idtoken",
  "id_token",
  "password",
  "passwd",
  "privatekey",
  "private_key",
  "proxyauthorization",
  "proxy_authorization",
  "pwd",
  "refreshtoken",
  "refresh_token",
  "secret",
  "sessioncookie",
  "session_cookie",
  "setcookie",
  "set_cookie",
  "token",
  "xapikey",
  "x_api_key",
  "accesskey",
  "access_key",
  "accesskeyid",
  "access_key_id",
  "accesstoken",
  "access_token",
  "apisecret",
  "api_secret",
  "authtoken",
  "auth_token",
  "secretkey",
  "secret_key",
  "secretaccesskey",
  "secret_access_key"
]);

export function sanitizeProviderInput(input: unknown, options: ProviderInputSanitizerOptions = {}): unknown {
  const config: SanitizerConfig = {
    ...DEFAULT_SANITIZER_CONFIG,
    ...options
  };

  return sanitizeValue(input, config, 0, new WeakSet<object>());
}

function sanitizeValue(
  value: unknown,
  config: SanitizerConfig,
  depth: number,
  activeObjects: WeakSet<object>
): unknown {
  if (typeof value === "string") {
    return sanitizeString(value, config.maxStringLength);
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= config.maxDepth) {
    return "[TRUNCATED_MAX_DEPTH]";
  }

  if (Array.isArray(value)) {
    return sanitizeArray(value, config, depth, activeObjects);
  }

  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, config, depth, activeObjects);
  }

  return value;
}

function sanitizeArray(
  values: unknown[],
  config: SanitizerConfig,
  depth: number,
  activeObjects: WeakSet<object>
): unknown[] {
  if (activeObjects.has(values)) {
    return ["[TRUNCATED_CIRCULAR_REFERENCE]"];
  }

  activeObjects.add(values);
  const keptValues = values.slice(0, config.maxArrayLength).map((item) =>
    sanitizeValue(item, config, depth + 1, activeObjects)
  );
  activeObjects.delete(values);

  if (values.length > config.maxArrayLength) {
    keptValues.push({
      [TRUNCATED_ARRAY_KEY]: values.length - config.maxArrayLength
    });
  }

  return keptValues;
}

function sanitizeObject(
  value: Record<string, unknown>,
  config: SanitizerConfig,
  depth: number,
  activeObjects: WeakSet<object>
): Record<string, unknown> | string {
  if (activeObjects.has(value)) {
    return "[TRUNCATED_CIRCULAR_REFERENCE]";
  }

  activeObjects.add(value);
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value);
  const keptEntries = entries.slice(0, config.maxObjectKeys);

  for (const [key, child] of keptEntries) {
    result[key] = isSensitiveKey(key)
      ? REDACTED_SENSITIVE_VALUE
      : sanitizeValue(child, config, depth + 1, activeObjects);
  }

  activeObjects.delete(value);

  if (entries.length > config.maxObjectKeys) {
    result[TRUNCATED_OBJECT_KEY] = entries.length - config.maxObjectKeys;
  }

  return result;
}

function sanitizeString(value: string, maxLength: number): string {
  const redacted = redactSensitiveText(value);
  if (redacted.length <= maxLength) {
    return redacted;
  }

  const omitted = redacted.length - maxLength;
  return `${redacted.slice(0, maxLength)}\n[TRUNCATED_${omitted}_CHARS]`;
}

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, "");

  return (
    SENSITIVE_KEY_NAMES.has(lowerKey) ||
    SENSITIVE_KEY_NAMES.has(normalizedKey) ||
    normalizedKey.endsWith("token") ||
    normalizedKey.endsWith("secret") ||
    normalizedKey.endsWith("password") ||
    normalizedKey.endsWith("apikey") ||
    normalizedKey.endsWith("privatekey") ||
    normalizedKey.endsWith("accesskey") ||
    normalizedKey.endsWith("cookie")
  );
}
