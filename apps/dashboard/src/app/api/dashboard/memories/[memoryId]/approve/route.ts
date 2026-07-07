import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import { dashboardErrorResponse } from "@/lib/server/dashboard-route-utils";

export const dynamic = "force-dynamic";

type ApproveRouteContext = {
  params: Promise<{
    memoryId: string;
  }>;
};

export async function POST(
  _request: Request,
  context: ApproveRouteContext
): Promise<NextResponse> {
  try {
    const { memoryId } = await context.params;
    const memory = await getDashboardMemoryBackend().approveMemory(memoryId);
    return NextResponse.json(memory);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
