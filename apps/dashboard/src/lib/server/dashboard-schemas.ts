import type {
  ConflictResolutionAction,
  MemoryPatch,
  TraceFeedbackInput
} from "@/lib/memory-client";
import { DashboardRequestError } from "./dashboard-route-utils";

const conflictActions = new Set<ConflictResolutionAction>([
  "accept_candidate",
  "reject_candidate",
  "supersede_existing",
  "merge",
  "keep_both",
  "dismiss_conflict"
]);

export function parseDashboardLogin(value: unknown): { apiKey: string } {
  const body = record(value, "Login request");
  assertAllowedKeys(body, ["apiKey"], "Login request");
  return { apiKey: requiredString(body.apiKey, "apiKey") };
}

export function parseMemoryPatch(value: unknown): MemoryPatch {
  const body = record(value, "Memory patch");
  assertAllowedKeys(
    body,
    ["confidence", "importance", "canonicalText", "validity"],
    "Memory patch"
  );
  const patch: MemoryPatch = {};

  if (body.confidence !== undefined) {
    patch.confidence = boundedNumber(body.confidence, "confidence");
  }
  if (body.importance !== undefined) {
    patch.importance = boundedNumber(body.importance, "importance");
  }
  if (body.canonicalText !== undefined) {
    patch.canonicalText = requiredString(body.canonicalText, "canonicalText");
  }
  if (body.validity !== undefined) {
    const validity = record(body.validity, "validity");
    assertAllowedKeys(validity, ["validFrom", "validUntil", "reason"], "validity");
    patch.validity = {
      validFrom: isoString(validity.validFrom, "validity.validFrom"),
      validUntil: optionalIsoString(validity.validUntil, "validity.validUntil"),
      reason: optionalString(validity.reason, "validity.reason")
    };
  }

  if (Object.keys(patch).length === 0) {
    throw new DashboardRequestError("Memory patch must include at least one change.");
  }
  return patch;
}

export function parseReason(value: unknown): { reason: string } {
  const body = record(value, "Memory action");
  assertAllowedKeys(body, ["reason"], "Memory action");
  return { reason: requiredString(body.reason, "reason") };
}

export function parseConflictResolution(value: unknown): {
  action: ConflictResolutionAction;
  reason: string;
  mergedText?: string;
} {
  const body = record(value, "Conflict resolution");
  assertAllowedKeys(body, ["action", "reason", "mergedText"], "Conflict resolution");
  if (typeof body.action !== "string" || !conflictActions.has(body.action as ConflictResolutionAction)) {
    throw new DashboardRequestError("action is not a supported conflict resolution.");
  }
  const action = body.action as ConflictResolutionAction;
  const reason = requiredString(body.reason, "reason");
  const mergedText = optionalString(body.mergedText, "mergedText");
  if (action === "merge" && !mergedText) {
    throw new DashboardRequestError("mergedText is required when action is merge.");
  }
  return { action, reason, mergedText };
}

export function parseTraceFeedback(value: unknown): TraceFeedbackInput {
  const body = record(value, "Trace feedback");
  assertAllowedKeys(body, ["rating", "reason", "correction", "outcome"], "Trace feedback");
  if (body.rating !== "helpful" && body.rating !== "unhelpful") {
    throw new DashboardRequestError("rating must be helpful or unhelpful.");
  }
  const result: TraceFeedbackInput = {
    rating: body.rating,
    reason: optionalString(body.reason, "reason"),
    correction: optionalString(body.correction, "correction"),
    outcome: optionalString(body.outcome, "outcome")
  };
  if (
    result.rating === "unhelpful" &&
    !result.reason &&
    !result.correction &&
    !result.outcome
  ) {
    throw new DashboardRequestError(
      "Unhelpful feedback requires a reason, correction, or outcome."
    );
  }
  if (result.rating === "helpful" && result.correction) {
    throw new DashboardRequestError(
      "correction is only allowed for unhelpful feedback."
    );
  }
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DashboardRequestError(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new DashboardRequestError(`${label} contains unsupported field ${unknown[0]}.`);
  }
}

function requiredString(value: unknown, path: string): string {
  const normalized = optionalString(value, path);
  if (!normalized) {
    throw new DashboardRequestError(`${path} is required.`);
  }
  return normalized;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new DashboardRequestError(`${path} must be a string.`);
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function boundedNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DashboardRequestError(`${path} must be a number from 0 to 1.`);
  }
  return value;
}

function isoString(value: unknown, path: string): string {
  const normalized = requiredString(value, path);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new DashboardRequestError(`${path} must be a valid date-time string.`);
  }
  return normalized;
}

function optionalIsoString(value: unknown, path: string): string | undefined {
  const normalized = optionalString(value, path);
  if (normalized === undefined) {
    return undefined;
  }
  if (Number.isNaN(Date.parse(normalized))) {
    throw new DashboardRequestError(`${path} must be a valid date-time string.`);
  }
  return normalized;
}
