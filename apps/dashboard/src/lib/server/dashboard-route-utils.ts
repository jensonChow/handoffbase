import { NextResponse } from "next/server";
import {
  MemoryMutationPreconditionError,
  SensitiveDataError,
  ValidationError
} from "@handoffbase/memory-core";
import { ScopeGuardError } from "../../../../../src/auth/scope";
import { MemoryConflictResolutionError } from "../../../../../src/services/continuity-memory-service";
import {
  DashboardAuthorizationError,
  DashboardConflictNotFoundError,
  DashboardInvalidMemoryStateError,
  DashboardMemoryConfigurationError,
  DashboardMemoryNotFoundError,
  DashboardTraceNotFoundError
} from "./dashboard-memory-store";
import { DashboardSessionError } from "./dashboard-session";

export class DashboardRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardRequestError";
  }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new DashboardRequestError("Request body must be valid JSON.");
  }
}

export function dashboardErrorResponse(error: unknown): NextResponse {
  if (error instanceof DashboardSessionError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.statusCode }
    );
  }

  if (error instanceof DashboardMemoryConfigurationError) {
    return NextResponse.json(
      {
        code: "dashboard_configuration_error",
        error: "The dashboard memory store is not configured."
      },
      { status: 503 }
    );
  }

  if (error instanceof DashboardMemoryNotFoundError) {
    return NextResponse.json(
      { code: "memory_not_found", error: error.message },
      { status: 404 }
    );
  }

  if (error instanceof DashboardInvalidMemoryStateError) {
    return NextResponse.json(
      { code: "memory_precondition_failed", error: error.message },
      { status: 409 }
    );
  }

  if (error instanceof MemoryMutationPreconditionError) {
    return NextResponse.json(
      {
        code: "memory_precondition_failed",
        error: "Memory lifecycle changed before this action completed. Refresh and retry.",
        expectedStatus: error.expectedStatus,
        actualStatus: error.actualStatus
      },
      { status: 409 }
    );
  }

  if (error instanceof MemoryConflictResolutionError) {
    return NextResponse.json(
      {
        code: "conflict_action_not_applicable",
        error: "The conflict state does not allow this action. Refresh and choose an applicable resolution."
      },
      { status: 409 }
    );
  }

  if (
    error instanceof DashboardConflictNotFoundError ||
    error instanceof DashboardTraceNotFoundError
  ) {
    return NextResponse.json(
      { code: "dashboard_record_not_found", error: error.message },
      { status: 404 }
    );
  }

  if (error instanceof DashboardAuthorizationError) {
    return NextResponse.json(
      { code: "dashboard_scope_forbidden", error: error.message },
      { status: 403 }
    );
  }

  if (error instanceof ScopeGuardError) {
    return NextResponse.json(
      {
        code: "handoffbase_scope_forbidden",
        error: "This dashboard request is outside the authenticated caller scope."
      },
      { status: 403 }
    );
  }

  if (error instanceof SensitiveDataError) {
    return NextResponse.json(
      {
        code: "sensitive_data_rejected",
        error: "Remove credentials or secrets from the feedback and try again."
      },
      { status: 400 }
    );
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      {
        code: "validation_error",
        error: error.message,
        issues: error.issues
      },
      { status: 400 }
    );
  }

  if (error instanceof DashboardRequestError) {
    return NextResponse.json(
      { code: "invalid_request", error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      code: "dashboard_store_error",
      error: "The dashboard memory store request failed."
    },
    { status: 500 }
  );
}
