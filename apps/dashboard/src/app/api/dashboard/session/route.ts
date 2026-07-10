import { NextResponse } from "next/server";
import { dashboardErrorResponse, readJsonBody } from "@/lib/server/dashboard-route-utils";
import { parseDashboardLogin } from "@/lib/server/dashboard-schemas";
import {
  DASHBOARD_SESSION_COOKIE,
  createDashboardSession,
  dashboardSessionCookieOptions,
  getDashboardSessionStatus,
  requireDashboardSameOriginMutation
} from "@/lib/server/dashboard-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json(getDashboardSessionStatus(request));
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireDashboardSameOriginMutation(request);
    const input = parseDashboardLogin(await readJsonBody<unknown>(request));
    const session = createDashboardSession(input.apiKey);
    const response = NextResponse.json(session.status);
    if (session.token) {
      response.cookies.set(
        DASHBOARD_SESSION_COOKIE,
        session.token,
        dashboardSessionCookieOptions()
      );
    }
    return response;
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    requireDashboardSameOriginMutation(request);
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(DASHBOARD_SESSION_COOKIE, "", {
      ...dashboardSessionCookieOptions(),
      maxAge: 0
    });
    return response;
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
