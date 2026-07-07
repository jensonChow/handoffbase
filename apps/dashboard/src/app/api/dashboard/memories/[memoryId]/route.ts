import { NextResponse } from "next/server";
import type { MemoryPatch } from "@/lib/memory-client";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import {
  dashboardErrorResponse,
  readJsonBody
} from "@/lib/server/dashboard-route-utils";

export const dynamic = "force-dynamic";

type MemoryRouteContext = {
  params: Promise<{
    memoryId: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: MemoryRouteContext
): Promise<NextResponse> {
  try {
    const { memoryId } = await context.params;
    const patch = await readJsonBody<MemoryPatch>(request);
    const memory = await getDashboardMemoryBackend().updateMemory(memoryId, patch);
    return NextResponse.json(memory);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: MemoryRouteContext
): Promise<NextResponse> {
  try {
    const { memoryId } = await context.params;
    const body = await readJsonBody<{ reason?: string }>(request);
    await getDashboardMemoryBackend().deleteMemory(memoryId, body.reason ?? "");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
