import { createMockMemoryClient } from "./mock-memory-client";

export type MemoryType =
  | "identity"
  | "user_preference"
  | "procedure"
  | "project_fact"
  | "tool_memory"
  | "decision_memory"
  | "failure_memory"
  | "outcome_memory"
  | "negative_preference"
  | "skill";

export type MemoryStatus =
  | "active"
  | "pending"
  | "invalidated"
  | "expired"
  | "superseded";

export type SourceKind =
  | "user_correction"
  | "run_reflection"
  | "manual_edit"
  | "memory_recall"
  | "import";

export type MemoryScope = {
  userId: string;
  agentProfileId?: string;
  hostId?: string;
  projectId?: string;
  toolId?: string;
};

export type MemoryValidity = {
  validFrom: string;
  validUntil?: string;
  reason?: string;
};

export type MemoryRecord = {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  source: {
    kind: SourceKind;
    label: string;
    runId?: string;
  };
  status: MemoryStatus;
  confidence: number;
  importance: number;
  validity: MemoryValidity;
  canonicalText: string;
  rawSource?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
  eventCount: number;
  supersedes?: string[];
  supersededBy?: string;
  metadata: Record<string, string | number | boolean>;
};

export type MemoryEvent = {
  id: string;
  memoryId: string;
  eventType: "created" | "approved" | "updated" | "invalidated" | "deleted" | "recalled";
  actorType: "user" | "agent" | "system";
  actorId: string;
  reason: string;
  createdAt: string;
  hardDeleted?: boolean;
  scopeLabel?: string;
};

export type TraceMemoryRef = {
  memoryId: string;
  text: string;
  type: MemoryType;
  score?: number;
  reason: string;
};

export type MemoryTrace = {
  id: string;
  runId: string;
  query: string;
  hostId: string;
  agentProfileId: string;
  createdAt: string;
  contextPack: string;
  usedMemories: TraceMemoryRef[];
  ignoredMemories: TraceMemoryRef[];
  excludedMemories: TraceMemoryRef[];
  metadata?: Record<string, string | number | boolean>;
};

export type ConflictCandidate = {
  id: string;
  status: "open" | "resolved" | "dismissed";
  conflictType: "contradiction" | "supersedes" | "duplicate" | "scope_overlap" | "none";
  severity: "low" | "medium" | "high";
  incoming: string;
  existing: string;
  recommendation: string;
  recommendedAction: ConflictResolutionAction;
  memoryType: MemoryType;
  scopeLabel: string;
};

export type ConflictResolutionAction =
  | "accept_candidate"
  | "reject_candidate"
  | "supersede_existing"
  | "merge"
  | "keep_both"
  | "dismiss_conflict";

export type ConflictResolutionInput = {
  action: ConflictResolutionAction;
  reason: string;
  mergedText?: string;
};

export type ConflictResolutionResult = {
  conflictId: string;
  action: ConflictResolutionAction;
  status: "resolved" | "dismissed";
  eventIds: string[];
  resolvedAt: string;
};

export type TraceFeedbackInput = {
  rating: "helpful" | "unhelpful";
  reason?: string;
  correction?: string;
  outcome?: string;
};

export type TraceFeedback = {
  id: string;
  traceId: string;
  memoryId?: string;
  rating: "helpful" | "unhelpful";
  reason?: string;
  correction?: string;
  correctionMemoryId?: string;
  runId?: string;
  createdAt: string;
  regressionFixture: Record<string, unknown>;
};

export type DashboardSession = {
  authenticated: boolean;
  authMode: "disabled" | "api_key";
  caller?: {
    tenantId: string;
    userId: string;
    actorType: "user" | "agent" | "system" | "dashboard" | "mcp_host";
    actorId: string;
    allowedAgentProfileIds?: string[];
    allowedProjectIds?: string[];
  };
};

export type DashboardRuntimeMode =
  | "mock_demo"
  | "server_in_memory"
  | "shared_persistent_store";

export type DashboardSnapshot = {
  runtime: {
    mode: DashboardRuntimeMode;
  };
  memories: MemoryRecord[];
  events: MemoryEvent[];
  traces: MemoryTrace[];
  conflicts: ConflictCandidate[];
  feedback: TraceFeedback[];
};

export type MemoryPatch = Partial<
  Pick<
    MemoryRecord,
    "confidence" | "importance" | "canonicalText" | "validity"
  >
>;

export interface MemoryClient {
  getSession(): Promise<DashboardSession>;
  login(apiKey: string): Promise<DashboardSession>;
  logout(): Promise<void>;
  listDashboard(): Promise<DashboardSnapshot>;
  updateMemory(memoryId: string, patch: MemoryPatch): Promise<MemoryRecord>;
  approveMemory(memoryId: string): Promise<MemoryRecord>;
  invalidateMemory(memoryId: string, reason: string): Promise<MemoryRecord>;
  deleteMemory(memoryId: string, reason: string): Promise<void>;
  resolveConflict(
    conflictId: string,
    input: ConflictResolutionInput
  ): Promise<ConflictResolutionResult>;
  submitTraceFeedback(
    traceId: string,
    input: TraceFeedbackInput
  ): Promise<TraceFeedback>;
}

export type MemoryClientMode = "mock" | "http";

export type HttpMemoryClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  headers?: HeadersInit;
};

export type CreateMemoryClientOptions = HttpMemoryClientOptions & {
  mode?: MemoryClientMode;
};

export class MemoryClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, options: { status: number; code?: string }) {
    super(message);
    this.name = "MemoryClientError";
    this.status = options.status;
    this.code = options.code;
  }
}

export class HttpMemoryClient implements MemoryClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly headers?: HeadersInit;

  constructor(options: HttpMemoryClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
    // Wrap the global fetch instead of storing a bare reference: calling
    // `this.fetcher(...)` on a bare `fetch` sets `this` to this instance, which
    // throws "Illegal invocation" in a browser (the default server-backed mode).
    this.fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    this.headers = options.headers;
  }

  getSession(): Promise<DashboardSession> {
    return this.request<DashboardSession>("/api/dashboard/session");
  }

  login(apiKey: string): Promise<DashboardSession> {
    return this.request<DashboardSession>("/api/dashboard/session", {
      method: "POST",
      body: JSON.stringify({ apiKey })
    });
  }

  async logout(): Promise<void> {
    await this.request<void>("/api/dashboard/session", { method: "DELETE" });
  }

  listDashboard(): Promise<DashboardSnapshot> {
    return this.request<DashboardSnapshot>("/api/dashboard/memory");
  }

  updateMemory(memoryId: string, patch: MemoryPatch): Promise<MemoryRecord> {
    return this.request<MemoryRecord>(`/api/dashboard/memories/${encodeURIComponent(memoryId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }

  approveMemory(memoryId: string): Promise<MemoryRecord> {
    return this.request<MemoryRecord>(
      `/api/dashboard/memories/${encodeURIComponent(memoryId)}/approve`,
      {
        method: "POST"
      }
    );
  }

  invalidateMemory(memoryId: string, reason: string): Promise<MemoryRecord> {
    return this.request<MemoryRecord>(
      `/api/dashboard/memories/${encodeURIComponent(memoryId)}/invalidate`,
      {
        method: "POST",
        body: JSON.stringify({ reason })
      }
    );
  }

  async deleteMemory(memoryId: string, reason: string): Promise<void> {
    await this.request<void>(`/api/dashboard/memories/${encodeURIComponent(memoryId)}`, {
      method: "DELETE",
      body: JSON.stringify({ reason })
    });
  }

  resolveConflict(
    conflictId: string,
    input: ConflictResolutionInput
  ): Promise<ConflictResolutionResult> {
    return this.request<ConflictResolutionResult>(
      `/api/dashboard/conflicts/${encodeURIComponent(conflictId)}/resolve`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  submitTraceFeedback(
    traceId: string,
    input: TraceFeedbackInput
  ): Promise<TraceFeedback> {
    return this.request<TraceFeedback>(
      `/api/dashboard/traces/${encodeURIComponent(traceId)}/feedback`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(this.headers);

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: init.credentials ?? "same-origin",
      headers
    });

    if (!response.ok) {
      const error = await readErrorResponse(response);
      throw new MemoryClientError(error.message, {
        status: response.status,
        code: error.code
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

async function readErrorResponse(response: Response): Promise<{
  message: string;
  code?: string;
}> {
  const fallback = `Memory dashboard API failed with ${response.status}`;

  try {
    const body = (await response.json()) as {
      code?: string;
      error?: string;
      message?: string;
    };
    return {
      message: body.error ?? body.message ?? fallback,
      code: body.code
    };
  } catch {
    return { message: fallback };
  }
}

export function createMemoryClient(options: CreateMemoryClientOptions = {}): MemoryClient {
  const mode = options.mode ?? "http";

  if (mode === "http") {
    return new HttpMemoryClient({
      ...options
    });
  }

  return createMockMemoryClient();
}

export { createMockMemoryClient } from "./mock-memory-client";
