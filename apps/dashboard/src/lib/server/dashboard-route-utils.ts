import { NextResponse } from "next/server";
import { ValidationError } from "@handoffbase/memory-core";
import { DashboardMemoryNotFoundError } from "./dashboard-memory-store";

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function dashboardErrorResponse(error: unknown): NextResponse {
  if (error instanceof DashboardMemoryNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      {
        error: error.message,
        issues: error.issues
      },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ error: "Memory dashboard API failed." }, { status: 500 });
}
