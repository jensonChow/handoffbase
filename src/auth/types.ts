import type { MemoryActorType } from "@handoffbase/memory-core";

export type AuthMode = "disabled" | "api_key";

export interface CallerContext {
  tenantId: string;
  userId: string;
  actorType: MemoryActorType;
  actorId: string;
  allowedAgentProfileIds?: string[];
  allowedProjectIds?: string[];
  authMode: AuthMode;
}

export interface ApiKeyCallerConfig {
  tenantId: string;
  userId: string;
  actorType?: MemoryActorType;
  actorId?: string;
  allowedAgentProfileIds?: string[];
  allowedProjectIds?: string[];
}

export interface AuthConfig {
  mode: AuthMode;
  apiKeys?: Record<string, ApiKeyCallerConfig>;
  disabledCaller?: CallerContext;
}

export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options: { statusCode?: number; code?: string } = {}) {
    super(message);
    this.name = "AuthError";
    this.statusCode = options.statusCode ?? 401;
    this.code = options.code ?? "handoffbase_auth_failed";
  }
}
