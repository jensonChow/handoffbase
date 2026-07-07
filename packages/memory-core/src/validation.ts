import {
  MEMORY_ACTOR_TYPES,
  MEMORY_CONFLICT_RECOMMENDED_ACTIONS,
  MEMORY_CONFLICT_SEVERITIES,
  MEMORY_CONFLICT_STATUSES,
  MEMORY_CONFLICT_TYPES,
  MEMORY_EVENT_TYPES,
  MEMORY_SOURCE_KINDS,
  MEMORY_STATUSES,
  MEMORY_TYPES,
  type MemoryConflictRecord,
  type MemoryEvent,
  type MemoryRecord,
  type MemoryScope
} from "./types.js";
import { findSensitiveData } from "./sensitive.js";
import { isPlainObject, isValidDate } from "./utils.js";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export function validateMemoryRecord(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return issueResult("record", "invalid_type", "Memory record must be an object.");
  }

  requireString(value.id, "id", issues);
  issues.push(...validateMemoryScope(value.scope, "scope"));
  requireEnum(value.type, MEMORY_TYPES, "type", issues);
  requireString(value.canonicalText, "canonicalText", issues);
  optionalString(value.rawSource, "rawSource", issues);
  requireEnum(value.sourceKind, MEMORY_SOURCE_KINDS, "sourceKind", issues);
  requireEnum(value.status, MEMORY_STATUSES, "status", issues);
  requireNumberRange(value.confidence, "confidence", 0, 1, issues);
  requireNumberRange(value.importance, "importance", 0, 1, issues);
  optionalDate(value.validFrom, "validFrom", issues);
  optionalDate(value.validUntil, "validUntil", issues);
  requireStringArray(value.supersedes, "supersedes", issues);
  optionalString(value.supersededBy, "supersededBy", issues);
  requireDate(value.createdAt, "createdAt", issues);
  requireDate(value.updatedAt, "updatedAt", issues);
  optionalDate(value.lastUsedAt, "lastUsedAt", issues);
  requireNonNegativeInteger(value.useCount, "useCount", issues);
  requirePlainObject(value.metadata, "metadata", issues);

  if (typeof value.canonicalText === "string") {
    addSensitiveIssues(value.canonicalText, "canonicalText", issues);
    if (value.canonicalText.trim().length > 4000) {
      issues.push({
        path: "canonicalText",
        code: "too_long",
        message: "Canonical memory text must be 4000 characters or fewer."
      });
    }
  }

  if (typeof value.rawSource === "string") {
    addSensitiveIssues(value.rawSource, "rawSource", issues);
    if (value.rawSource.length > 8000) {
      issues.push({
        path: "rawSource",
        code: "too_long",
        message: "Raw source must be 8000 characters or fewer and must not contain full chat logs."
      });
    }
  }

  if (isValidDate(value.validFrom) && isValidDate(value.validUntil) && value.validUntil <= value.validFrom) {
    issues.push({
      path: "validUntil",
      code: "invalid_range",
      message: "validUntil must be after validFrom."
    });
  }

  if (value.status === "superseded" && typeof value.supersededBy !== "string") {
    issues.push({
      path: "supersededBy",
      code: "missing_superseded_by",
      message: "Superseded memories must point to the replacement memory."
    });
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function validateMemoryEvent(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return issueResult("event", "invalid_type", "Memory event must be an object.");
  }

  requireString(value.id, "id", issues);
  requireString(value.tenantId, "tenantId", issues);
  optionalString(value.memoryId, "memoryId", issues);
  optionalString(value.runId, "runId", issues);
  optionalString(value.traceId, "traceId", issues);
  requireEnum(value.eventType, MEMORY_EVENT_TYPES, "eventType", issues);
  validateActor(value.actor, "actor", issues);
  optionalString(value.reason, "reason", issues);
  optionalPlainObject(value.before, "before", issues);
  optionalPlainObject(value.after, "after", issues);
  requireDate(value.createdAt, "createdAt", issues);
  requirePlainObject(value.metadata, "metadata", issues);

  if (value.eventType !== "recall" && typeof value.memoryId !== "string") {
    issues.push({
      path: "memoryId",
      code: "missing_memory_id",
      message: "Non-recall memory events must reference a memory."
    });
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function validateMemoryConflictRecord(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return issueResult("conflict", "invalid_type", "Memory conflict record must be an object.");
  }

  requireString(value.id, "id", issues);
  requireString(value.tenantId, "tenantId", issues);
  optionalString(value.candidateMemoryId, "candidateMemoryId", issues);
  optionalString(value.existingMemoryId, "existingMemoryId", issues);
  requireEnum(value.conflictType, MEMORY_CONFLICT_TYPES, "conflictType", issues);
  requireEnum(value.severity, MEMORY_CONFLICT_SEVERITIES, "severity", issues);
  requireEnum(value.recommendedAction, MEMORY_CONFLICT_RECOMMENDED_ACTIONS, "recommendedAction", issues);
  requireEnum(value.status, MEMORY_CONFLICT_STATUSES, "status", issues);
  optionalString(value.reason, "reason", issues);
  if (value.confidence !== undefined) {
    requireNumberRange(value.confidence, "confidence", 0, 1, issues);
  }
  optionalPlainObject(value.resolution, "resolution", issues);
  requireDate(value.createdAt, "createdAt", issues);
  optionalDate(value.resolvedAt, "resolvedAt", issues);
  requirePlainObject(value.metadata, "metadata", issues);

  if (typeof value.candidateMemoryId !== "string" && typeof value.existingMemoryId !== "string") {
    issues.push({
      path: "candidateMemoryId",
      code: "missing_memory_reference",
      message: "Memory conflicts must reference a candidate or existing memory."
    });
  }

  if (
    isPlainObject(value.resolution) &&
    (typeof value.resolution.action !== "string" || value.resolution.action.trim().length === 0)
  ) {
    issues.push({
      path: "resolution.action",
      code: "invalid_string",
      message: "Conflict resolution must include a non-empty action string."
    });
  }

  if (value.status !== "open" && !isValidDate(value.resolvedAt)) {
    issues.push({
      path: "resolvedAt",
      code: "missing_resolved_at",
      message: "Resolved or dismissed conflicts must have a resolvedAt timestamp."
    });
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function assertValidMemoryRecord(value: unknown): asserts value is MemoryRecord {
  const result = validateMemoryRecord(value);
  if (!result.ok) {
    throw new ValidationError("Invalid memory record.", result.issues);
  }
}

export function assertValidMemoryEvent(value: unknown): asserts value is MemoryEvent {
  const result = validateMemoryEvent(value);
  if (!result.ok) {
    throw new ValidationError("Invalid memory event.", result.issues);
  }
}

export function assertValidMemoryConflictRecord(value: unknown): asserts value is MemoryConflictRecord {
  const result = validateMemoryConflictRecord(value);
  if (!result.ok) {
    throw new ValidationError("Invalid memory conflict record.", result.issues);
  }
}

export function validateMemoryScope(value: unknown, path = "scope"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    issues.push({
      path,
      code: "invalid_type",
      message: "Memory scope must be an object."
    });
    return issues;
  }

  requireString(value.tenantId, `${path}.tenantId`, issues);
  requireString(value.userId, `${path}.userId`, issues);
  optionalString(value.agentProfileId, `${path}.agentProfileId`, issues);
  optionalString(value.projectId, `${path}.projectId`, issues);
  optionalString(value.hostId, `${path}.hostId`, issues);
  optionalString(value.sessionId, `${path}.sessionId`, issues);
  optionalString(value.toolId, `${path}.toolId`, issues);

  return issues;
}

export function isMemoryScope(value: unknown): value is MemoryScope {
  return validateMemoryScope(value).length === 0;
}

function validateActor(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push({
      path,
      code: "invalid_type",
      message: "Actor must be an object."
    });
    return;
  }

  requireEnum(value.type, MEMORY_ACTOR_TYPES, `${path}.type`, issues);
  optionalString(value.id, `${path}.id`, issues);
}

function issueResult(path: string, code: string, message: string): ValidationResult {
  return {
    ok: false,
    issues: [{ path, code, message }]
  };
}

function requireString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      path,
      code: "invalid_string",
      message: `${path} must be a non-empty string.`
    });
  }
}

function optionalString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    issues.push({
      path,
      code: "invalid_string",
      message: `${path} must be a non-empty string when provided.`
    });
  }
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
  issues: ValidationIssue[]
): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      path,
      code: "invalid_enum",
      message: `${path} must be one of: ${allowed.join(", ")}.`
    });
  }
}

function requireNumberRange(value: unknown, path: string, min: number, max: number, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    issues.push({
      path,
      code: "invalid_number",
      message: `${path} must be a number between ${min} and ${max}.`
    });
  }
}

function requireNonNegativeInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    issues.push({
      path,
      code: "invalid_integer",
      message: `${path} must be a non-negative integer.`
    });
  }
}

function requireStringArray(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    issues.push({
      path,
      code: "invalid_string_array",
      message: `${path} must be an array of non-empty strings.`
    });
  }
}

function requireDate(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isValidDate(value)) {
    issues.push({
      path,
      code: "invalid_date",
      message: `${path} must be a valid Date.`
    });
  }
}

function optionalDate(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined && !isValidDate(value)) {
    issues.push({
      path,
      code: "invalid_date",
      message: `${path} must be a valid Date when provided.`
    });
  }
}

function requirePlainObject(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push({
      path,
      code: "invalid_object",
      message: `${path} must be a plain object.`
    });
  }
}

function optionalPlainObject(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined && !isPlainObject(value)) {
    issues.push({
      path,
      code: "invalid_object",
      message: `${path} must be a plain object when provided.`
    });
  }
}

function addSensitiveIssues(text: string, path: string, issues: ValidationIssue[]): void {
  for (const finding of findSensitiveData(text)) {
    issues.push({
      path,
      code: "sensitive_data",
      message: `Refusing to persist likely sensitive data (${finding.type}, ${finding.pattern}).`
    });
  }
}
