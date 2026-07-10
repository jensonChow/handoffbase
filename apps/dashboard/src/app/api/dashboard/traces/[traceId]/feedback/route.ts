import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import { dashboardErrorResponse, readJsonBody } from "@/lib/server/dashboard-route-utils";
import { parseTraceFeedback } from "@/lib/server/dashboard-schemas";
import {
  requireDashboardCaller,
  requireDashboardSameOriginMutation
} from "@/lib/server/dashboard-session";

export const dynamic = "force-dynamic";

type TraceFeedbackRouteContext = {
  params: Promise<{ traceId: string }>;
};

export async function POST(
  request: Request,
  context: TraceFeedbackRouteContext
): Promise<NextResponse> {
  try {
    requireDashboardSameOriginMutation(request);
    const caller = requireDashboardCaller(request);
    const { traceId } = await context.params;
    const input = parseTraceFeedback(await readJsonBody<unknown>(request));
    const feedback = await getDashboardMemoryBackend().submitTraceFeedback(
      traceId,
      input,
      caller
    );
    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
