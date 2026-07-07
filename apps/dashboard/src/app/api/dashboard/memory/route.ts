import { NextResponse } from "next/server";
import { getDashboardMemoryBackend } from "@/lib/server/dashboard-memory-store";
import { dashboardErrorResponse } from "@/lib/server/dashboard-route-utils";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const snapshot = await getDashboardMemoryBackend().listDashboard();
    return NextResponse.json(snapshot);
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
