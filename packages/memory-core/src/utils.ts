import type { JsonObject, JsonValue, MemoryRecord, MemoryScope } from "./types.js";

export function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function normalizeDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

export function cloneJsonValue<T extends JsonValue | undefined>(value: T): T {
  if (value === undefined) {
    return undefined as T;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneJsonObject(value: JsonObject | undefined): JsonObject {
  return cloneJsonValue(value ?? {});
}

export function trimOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeScope(scope: MemoryScope): MemoryScope {
  const normalized: MemoryScope = {
    tenantId: scope.tenantId.trim(),
    userId: scope.userId.trim()
  };

  setOptionalString(normalized, "agentProfileId", scope.agentProfileId);
  setOptionalString(normalized, "projectId", scope.projectId);
  setOptionalString(normalized, "hostId", scope.hostId);
  setOptionalString(normalized, "sessionId", scope.sessionId);
  setOptionalString(normalized, "toolId", scope.toolId);

  return normalized;
}

export function cloneMemoryRecord(memory: MemoryRecord): MemoryRecord {
  const clone: MemoryRecord = {
    id: memory.id,
    scope: { ...memory.scope },
    type: memory.type,
    canonicalText: memory.canonicalText,
    sourceKind: memory.sourceKind,
    status: memory.status,
    confidence: memory.confidence,
    importance: memory.importance,
    supersedes: [...memory.supersedes],
    createdAt: new Date(memory.createdAt.getTime()),
    updatedAt: new Date(memory.updatedAt.getTime()),
    useCount: memory.useCount,
    metadata: cloneJsonObject(memory.metadata)
  };

  setOptionalString(clone, "rawSource", memory.rawSource);
  setOptionalDate(clone, "validFrom", memory.validFrom);
  setOptionalDate(clone, "validUntil", memory.validUntil);
  setOptionalString(clone, "supersededBy", memory.supersededBy);
  setOptionalDate(clone, "lastUsedAt", memory.lastUsedAt);

  return clone;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function stringifyDate(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export function setOptionalString<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string | undefined
): void {
  const trimmed = trimOptionalString(value);
  if (trimmed !== undefined) {
    target[key] = trimmed as T[K];
  }
}

export function setOptionalDate<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: Date | undefined
): void {
  if (value !== undefined) {
    target[key] = new Date(value.getTime()) as T[K];
  }
}
