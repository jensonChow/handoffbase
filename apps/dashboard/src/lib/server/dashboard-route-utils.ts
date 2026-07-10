import { NextResponse } from "next/server";
import { ValidationError } from "@handoffbase/memory-core";
import {
  DashboardMemoryConfigurationError,
  DashboardMemoryNotFoundError
} from "./dashboard-memory-store";

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
