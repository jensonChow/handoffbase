import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import {
  dashboardErrorResponse,
  readJsonBody
} from "@/lib/server/dashboard-route-utils";
import { parseMemoryPatch, parseReason } from "@/lib/server/dashboard-schemas";
import {
  requireDashboardCaller,
  requireDashboardSameOriginMutation
} from "@/lib/server/dashboard-session";

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
    requireDashboardSameOriginMutation(request);
    const caller = requireDashboardCaller(request);
    const { memoryId } = await context.params;
    const patch = parseMemoryPatch(await readJsonBody<unknown>(request));
    const memory = await getDashboardMemoryBackend().updateMemory(memoryId, patch, caller);
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
    requireDashboardSameOriginMutation(request);
    const caller = requireDashboardCaller(request);
    const { memoryId } = await context.params;
    const body = parseReason(await readJsonBody<unknown>(request));
    await getDashboardMemoryBackend().deleteMemory(memoryId, body.reason, caller);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
