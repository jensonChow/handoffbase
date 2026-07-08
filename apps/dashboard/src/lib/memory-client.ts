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
};

export type ConflictCandidate = {
  id: string;
  status: "needs_review" | "placeholder";
  incoming: string;
  existing: string;
  conflictType: "contradiction" | "supersedes" | "duplicate" | "scope_overlap" | "none";
  severity: "low" | "medium" | "high";
  recommendedAction:
    | "accept"
    | "ignore"
    | "merge"
    | "supersede"
    | "supersede_existing"
    | "ask_user"
    | "keep_both"
    | "reject";
  recommendation: string;
  memoryType: MemoryType;
  scopeLabel: string;
};

export type DashboardSnapshot = {
  memories: MemoryRecord[];
  events: MemoryEvent[];
  traces: MemoryTrace[];
  conflicts: ConflictCandidate[];
};

export type MemoryPatch = Partial<
  Pick<
    MemoryRecord,
    "type" | "status" | "confidence" | "importance" | "canonicalText" | "validity"
  >
>;

export interface MemoryClient {
  listDashboard(): Promise<DashboardSnapshot>;
  updateMemory(memoryId: string, patch: MemoryPatch): Promise<MemoryRecord>;
  approveMemory(memoryId: string): Promise<MemoryRecord>;
  invalidateMemory(memoryId: string, reason: string): Promise<MemoryRecord>;
  deleteMemory(memoryId: string, reason: string): Promise<void>;
}

export type MemoryClientMode = "mock" | "http";

export type HttpMemoryClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  headers?: HeadersInit;
};

export type CreateMemoryClientOptions =
  | ({ mode?: "mock" } & HttpMemoryClientOptions)
  | ({ mode: "http" } & HttpMemoryClientOptions);

export class HttpMemoryClient implements MemoryClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly headers?: HeadersInit;

  constructor(options: HttpMemoryClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
    this.fetcher = options.fetcher ?? fetch;
    this.headers = options.headers;
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
      headers
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

async function readErrorMessage(response: Response) {
  const fallback = `Memory dashboard API failed with ${response.status}`;

  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function createMemoryClient(options: CreateMemoryClientOptions = {}): MemoryClient {
  const mode = options.mode ?? defaultMemoryClientMode();

  if (mode === "http") {
    return new HttpMemoryClient({
      ...options,
      baseUrl: options.baseUrl ?? defaultMemoryClientBaseUrl()
    });
  }

  return createMockMemoryClient();
}

export { createMockMemoryClient } from "./mock-memory-client";

function defaultMemoryClientMode(): MemoryClientMode {
  return process.env.NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_CLIENT === "http" ? "http" : "mock";
}

function defaultMemoryClientBaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_API_BASE_URL;
}
