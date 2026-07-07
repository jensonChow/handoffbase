import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import {
  dashboardErrorResponse,
  readJsonBody
} from "@/lib/server/dashboard-route-utils";

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
    const { memoryId } = await context.params;
    const body = await readJsonBody<{ reason?: string }>(request);
    const memory = await getDashboardMemoryBackend().invalidateMemory(memoryId, body.reason ?? "");
    return NextResponse.json(memory);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
