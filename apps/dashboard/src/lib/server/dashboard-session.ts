import { createHmac, timingSafeEqual } from "node:crypto";
import { authConfigFromEnv } from "../../../../../src/auth/config";
import {
  type AuthMode,
  type CallerContext
} from "../../../../../src/auth/types";

export const DASHBOARD_SESSION_COOKIE = "handoffbase_dashboard_session";

const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type DashboardSessionStatus = {
  authenticated: boolean;
  authMode: AuthMode;
  caller?: DashboardSessionCaller;
};

export type DashboardSessionCaller = Pick<
  CallerContext,
  | "tenantId"
  | "userId"
  | "actorType"
  | "actorId"
  | "allowedAgentProfileIds"
  | "allowedProjectIds"
>;

type SignedDashboardSession = {
  keyFingerprint: string;
  exp: number;
};

export class DashboardSessionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(
    message: string,
    options: { code?: string; statusCode?: number } = {}
  ) {
    super(message);
    this.name = "DashboardSessionError";
    this.code = options.code ?? "dashboard_auth_required";
    this.statusCode = options.statusCode ?? 401;
  }
}

export function getDashboardSessionStatus(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  now = Date.now()
): DashboardSessionStatus {
  const config = authConfigFromEnv(env);

  if (config.mode === "disabled") {
    assertDisabledModeAllowed(env);
    const caller = config.disabledCaller;
    if (!caller) {
      throw new DashboardSessionError(
        "Disabled dashboard authentication is missing its caller configuration.",
        { code: "dashboard_session_configuration_error", statusCode: 503 }
      );
    }
    return authenticatedStatus(caller);
  }

  const secret = dashboardSessionSecret(env);
  const token = readSessionCookie(request);
  const session = token ? verifySessionToken(token, secret, now) : undefined;
  if (!session) {
    return { authenticated: false, authMode: "api_key" };
  }

  const caller = callerForFingerprint(
    session.keyFingerprint,
    config,
    secret
  );
  return caller
    ? authenticatedStatus(caller)
    : { authenticated: false, authMode: "api_key" };
}

export function requireDashboardCaller(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  now = Date.now()
): CallerContext {
  const status = getDashboardSessionStatus(request, env, now);
  if (!status.authenticated || !status.caller) {
    throw new DashboardSessionError("Sign in to access HandoffBase Memory Vault.");
  }

  return {
    ...status.caller,
    allowedAgentProfileIds: status.caller.allowedAgentProfileIds
      ? [...status.caller.allowedAgentProfileIds]
      : undefined,
    allowedProjectIds: status.caller.allowedProjectIds
      ? [...status.caller.allowedProjectIds]
      : undefined,
    authMode: status.authMode
  };
}

export function createDashboardSession(
  apiKey: string,
  env: Record<string, string | undefined> = process.env,
  now = Date.now()
): { status: DashboardSessionStatus; token?: string } {
  const config = authConfigFromEnv(env);

  if (config.mode === "disabled") {
    assertDisabledModeAllowed(env);
    if (!config.disabledCaller) {
      throw new DashboardSessionError(
        "Disabled dashboard authentication is missing its caller configuration.",
        { code: "dashboard_session_configuration_error", statusCode: 503 }
      );
    }
    return {
      status: authenticatedStatus(config.disabledCaller)
    };
  }

  const caller = callerForApiKey(apiKey, config);
  if (!caller) {
    throw new DashboardSessionError("The HandoffBase API key is invalid.", {
      code: "dashboard_auth_invalid_api_key",
      statusCode: 401
    });
  }

  const secret = dashboardSessionSecret(env);
  const token = signSessionToken(
    {
      keyFingerprint: apiKeyFingerprint(apiKey, secret),
      exp: now + SESSION_TTL_SECONDS * 1000
    },
    secret
  );

  return { status: authenticatedStatus(caller), token };
}

export function requireDashboardSameOriginMutation(
  request: Request,
  env: Record<string, string | undefined> = process.env
): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const origin = request.headers.get("origin");
  let requestOrigin: string;
  let suppliedOrigin: string;
  try {
    requestOrigin = effectiveRequestOrigin(request);
    suppliedOrigin = origin ? new URL(origin).origin : "";
  } catch {
    requestOrigin = "";
    suppliedOrigin = "";
  }
  if (
    !origin ||
    !requestOrigin ||
    origin !== suppliedOrigin ||
    suppliedOrigin !== requestOrigin
  ) {
    throw new DashboardSessionError(
      "Dashboard mutation rejected because the request origin is missing or does not match.",
      {
        code: "dashboard_csrf_rejected",
        statusCode: 403
      }
    );
  }
}

function effectiveRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = firstForwardedHeader(
    request.headers.get("x-forwarded-host")
  );
  const host =
    forwardedHost ?? request.headers.get("host")?.trim() ?? requestUrl.host;
  const forwardedProtocol = firstForwardedHeader(
    request.headers.get("x-forwarded-proto")
  );
  const protocol = forwardedProtocol ?? requestUrl.protocol.replace(/:$/, "");
  if (!host || (protocol !== "http" && protocol !== "https")) {
    return "";
  }
  return new URL(`${protocol}://${host}`).origin;
}

function firstForwardedHeader(value: string | null): string | undefined {
  const first = value?.split(",", 1)[0]?.trim();
  return first || undefined;
}

export function dashboardSessionCookieOptions(): {
  httpOnly: true;
  maxAge: number;
  path: "/";
  sameSite: "strict";
  secure: boolean;
} {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  };
}

function authenticatedStatus(caller: CallerContext): DashboardSessionStatus {
  return {
    authenticated: true,
    authMode: caller.authMode,
    caller: {
      tenantId: caller.tenantId,
      userId: caller.userId,
      actorType: caller.actorType,
      actorId: caller.actorId,
      allowedAgentProfileIds: caller.allowedAgentProfileIds
        ? [...caller.allowedAgentProfileIds]
        : undefined,
      allowedProjectIds: caller.allowedProjectIds
        ? [...caller.allowedProjectIds]
        : undefined
    }
  };
}

function readSessionCookie(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return undefined;
  }

  for (const item of cookie.split(";")) {
    const separator = item.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = item.slice(0, separator).trim();
    if (name !== DASHBOARD_SESSION_COOKIE) {
      continue;
    }
    const value = item.slice(separator + 1).trim();
    if (!value) {
      return undefined;
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function dashboardSessionSecret(
  env: Record<string, string | undefined>
): string {
  const secret = env.HANDOFFBASE_DASHBOARD_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new DashboardSessionError(
      "HANDOFFBASE_DASHBOARD_SESSION_SECRET must contain at least 32 characters in api_key mode.",
      {
        code: "dashboard_session_configuration_error",
        statusCode: 503
      }
    );
  }
  return secret;
}

function assertDisabledModeAllowed(
  env: Record<string, string | undefined>
): void {
  if (env.NODE_ENV === "production") {
    throw new DashboardSessionError(
      "HandoffBase Dashboard requires HANDOFFBASE_AUTH_MODE=api_key in production.",
      {
        code: "dashboard_insecure_auth_configuration",
        statusCode: 503
      }
    );
  }
}

function signSessionToken(session: SignedDashboardSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sessionSignature(payload, secret)}`;
}

function verifySessionToken(
  token: string,
  secret: string,
  now: number
): SignedDashboardSession | undefined {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) {
    return undefined;
  }
  const expected = Buffer.from(sessionSignature(payload, secret), "base64url");
  const observed = Buffer.from(signature, "base64url");
  if (expected.length !== observed.length || !timingSafeEqual(expected, observed)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as unknown;
    if (!isSignedSession(parsed) || parsed.exp <= now) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function sessionSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function apiKeyFingerprint(apiKey: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("handoffbase-dashboard-api-key\0")
    .update(apiKey)
    .digest("base64url");
}

function callerForFingerprint(
  fingerprint: string,
  config: ReturnType<typeof authConfigFromEnv>,
  secret: string
): CallerContext | undefined {
  for (const apiKey of Object.keys(config.apiKeys ?? {})) {
    if (!constantTimeBase64UrlEqual(fingerprint, apiKeyFingerprint(apiKey, secret))) {
      continue;
    }
    return callerForApiKey(apiKey, config);
  }
  return undefined;
}

function callerForApiKey(
  apiKey: string,
  config: ReturnType<typeof authConfigFromEnv>
): CallerContext | undefined {
  const caller = config.apiKeys?.[apiKey];
  if (!caller) {
    return undefined;
  }
  return {
    tenantId: caller.tenantId,
    userId: caller.userId,
    actorType: caller.actorType ?? "mcp_host",
    actorId: caller.actorId ?? caller.userId,
    allowedAgentProfileIds: caller.allowedAgentProfileIds
      ? [...caller.allowedAgentProfileIds]
      : undefined,
    allowedProjectIds: caller.allowedProjectIds
      ? [...caller.allowedProjectIds]
      : undefined,
    authMode: "api_key"
  };
}

function constantTimeBase64UrlEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "base64url");
  const rightBuffer = Buffer.from(right, "base64url");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isSignedSession(value: unknown): value is SignedDashboardSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const session = value as Partial<SignedDashboardSession>;
  return (
    typeof session.exp === "number" &&
    Number.isFinite(session.exp) &&
    typeof session.keyFingerprint === "string" &&
    session.keyFingerprint.length > 0
  );
}
