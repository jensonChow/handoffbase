import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import { dashboardErrorResponse } from "@/lib/server/dashboard-route-utils";
import { requireDashboardCaller } from "@/lib/server/dashboard-session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request = new Request("http://localhost/api/dashboard/memory")
): Promise<NextResponse> {
  try {
    const caller = requireDashboardCaller(request);
    const snapshot = await getDashboardMemoryBackend().listDashboard(caller);
    return NextResponse.json(snapshot);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
