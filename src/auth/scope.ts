import type { MemoryActor, MemoryScope } from "@handoffbase/memory-core";
import type { CallerContext } from "./types.js";

export class ScopeGuardError extends Error {
  readonly code = "handoffbase_scope_forbidden";

  constructor(message: string) {
    super(message);
    this.name = "ScopeGuardError";
  }
}

export function isAuthEnforced(caller: CallerContext | undefined): caller is CallerContext {
  return caller?.authMode === "api_key";
}

export function callerActor(caller: CallerContext | undefined, fallback: MemoryActor): MemoryActor {
  if (!isAuthEnforced(caller)) {
    return fallback;
  }
  return {
    type: caller.actorType,
    id: caller.actorId,
  };
}

export function applyCallerAllowedDefaults(scope: MemoryScope, caller: CallerContext | undefined): MemoryScope {
  if (!isAuthEnforced(caller)) {
    return scope;
  }

  return {
    ...scope,
    agentProfileId: scope.agentProfileId ?? singleAllowedValue(caller.allowedAgentProfileIds),
    projectId: scope.projectId ?? singleAllowedValue(caller.allowedProjectIds),
  };
}

export function assertScopeAllowed(
  scope: MemoryScope,
  caller: CallerContext | undefined,
  operation: string,
): void {
  if (!isAuthEnforced(caller)) {
    return;
  }

  if (scope.tenantId !== caller.tenantId) {
    throw new ScopeGuardError(`${operation} is not authorized for tenant ${scope.tenantId}.`);
  }
  if (scope.userId !== caller.userId) {
    throw new ScopeGuardError(`${operation} is not authorized for user ${scope.userId}.`);
  }

  assertOptionalScopeDimension(scope.agentProfileId, caller.allowedAgentProfileIds, "agent profile", operation);
  assertOptionalScopeDimension(scope.projectId, caller.allowedProjectIds, "project", operation);
}

export function assertScopedRequestNarrowed(
  scope: MemoryScope,
  caller: CallerContext | undefined,
  operation: string,
): void {
  assertScopeAllowed(scope, caller, operation);
  if (!isAuthEnforced(caller)) {
    return;
  }

  assertRequiredNarrowing(scope.agentProfileId, caller.allowedAgentProfileIds, "agent_profile_id", operation);
  assertRequiredNarrowing(scope.projectId, caller.allowedProjectIds, "project_id", operation);
}

function assertOptionalScopeDimension(
  value: string | undefined,
  allowedValues: string[] | undefined,
  label: string,
  operation: string,
): void {
  if (value === undefined || allowedValues === undefined) {
    return;
  }
  if (!allowedValues.includes(value)) {
    throw new ScopeGuardError(`${operation} is not authorized for ${label} ${value}.`);
  }
}

function assertRequiredNarrowing(
  value: string | undefined,
  allowedValues: string[] | undefined,
  inputName: string,
  operation: string,
): void {
  if (allowedValues === undefined || value !== undefined) {
    return;
  }
  throw new ScopeGuardError(`${operation} must include ${inputName} because the caller is restricted to specific values.`);
}

function singleAllowedValue(values: string[] | undefined): string | undefined {
  return values?.length === 1 ? values[0] : undefined;
}
