import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import {
  dashboardErrorResponse,
  readJsonBody
} from "@/lib/server/dashboard-route-utils";
import { parseReason } from "@/lib/server/dashboard-schemas";
import {
  requireDashboardCaller,
  requireDashboardSameOriginMutation
} from "@/lib/server/dashboard-session";

export const dynamic = "force-dynamic";

type InvalidateRouteContext = {
  params: Promise<{
    memoryId: string;
  }>;
};

export async function POST(
  request: Request,
  context: InvalidateRouteContext
): Promise<NextResponse> {
  try {
    requireDashboardSameOriginMutation(request);
    const caller = requireDashboardCaller(request);
    const { memoryId } = await context.params;
    const body = parseReason(await readJsonBody<unknown>(request));
    const memory = await getDashboardMemoryBackend().invalidateMemory(
      memoryId,
      body.reason,
      caller
    );
    return NextResponse.json(memory);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
