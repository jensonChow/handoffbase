import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import { dashboardErrorResponse, readJsonBody } from "@/lib/server/dashboard-route-utils";
import { parseConflictResolution } from "@/lib/server/dashboard-schemas";
import {
  requireDashboardCaller,
  requireDashboardSameOriginMutation
} from "@/lib/server/dashboard-session";

export const dynamic = "force-dynamic";

type ConflictRouteContext = {
  params: Promise<{ conflictId: string }>;
};

export async function POST(
  request: Request,
  context: ConflictRouteContext
): Promise<NextResponse> {
  try {
    requireDashboardSameOriginMutation(request);
    const caller = requireDashboardCaller(request);
    const { conflictId } = await context.params;
    const input = parseConflictResolution(await readJsonBody<unknown>(request));
    const result = await getDashboardMemoryBackend().resolveConflict(
      conflictId,
      input,
      caller
    );
    return NextResponse.json(result);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
