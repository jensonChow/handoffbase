import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import { dashboardErrorResponse } from "@/lib/server/dashboard-route-utils";
import {
  requireDashboardCaller,
  requireDashboardSameOriginMutation
} from "@/lib/server/dashboard-session";

export const dynamic = "force-dynamic";

type ApproveRouteContext = {
  params: Promise<{
    memoryId: string;
  }>;
};

export async function POST(
  request: Request,
  context: ApproveRouteContext
): Promise<NextResponse> {
  try {
    requireDashboardSameOriginMutation(request);
    const caller = requireDashboardCaller(request);
    const { memoryId } = await context.params;
    const memory = await getDashboardMemoryBackend().approveMemory(memoryId, caller);
    return NextResponse.json(memory);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
