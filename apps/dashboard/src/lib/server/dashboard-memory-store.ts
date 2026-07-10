import {
  InMemoryMemoryStore,
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type JsonObject,
  type MemoryRecord as CoreMemoryRecord,
  type MemoryScopeFilter,
  type MemoryStore,
  type MemoryTrace,
  type RunRecord
} from "@handoffbase/memory-core";
import type {
  DashboardSnapshot,
  DashboardRuntimeMode,
  MemoryPatch,
  MemoryRecord as DashboardMemoryRecord
} from "@/lib/memory-client";
import {
  isDashboardVisibleMemory,
  toCoreMemoryPatch,
  toDashboardMemory,
  toDashboardSnapshot
} from "./dashboard-memory-mappers";

const DEFAULT_TENANT_ID = "tenant_demo";
const DEFAULT_SCOPE: MemoryScopeFilter = {
  tenantId: DEFAULT_TENANT_ID,
  userId: "user_demo"
};
const DASHBOARD_ACTOR = { type: "dashboard" as const, id: "dashboard" };
const SEED_NOW = "2026-07-07T00:30:00.000Z";

export type DashboardServerRuntimeMode = Extract<
  DashboardRuntimeMode,
  "server_in_memory" | "shared_persistent_store"
>;

export type DashboardTraceLoader = (input: {
  store: MemoryStore;
  scope: MemoryScopeFilter;
}) => Promise<MemoryTrace[]>;

export type DashboardMemoryLoader = (input: {
  store: MemoryStore;
  scope: MemoryScopeFilter;
}) => Promise<CoreMemoryRecord[]>;

export type DashboardMemoryStoreBinding = {
  store: MemoryStore;
  mode: DashboardServerRuntimeMode;
  scope: MemoryScopeFilter;
  seedDemoData: boolean;
  loadMemories?: DashboardMemoryLoader;
  loadTraces?: DashboardTraceLoader;
};

export type DashboardMemoryStoreFactory = () =>
  | DashboardMemoryStoreBinding
  | Promise<DashboardMemoryStoreBinding>;

export type DashboardMemoryBackendOptions = Partial<
  Omit<DashboardMemoryStoreBinding, "store">
>;

export class DashboardMemoryNotFoundError extends Error {
  constructor(memoryId: string) {
    super(`Memory ${memoryId} was not found.`);
    this.name = "DashboardMemoryNotFoundError";
  }
}

export class DashboardMemoryConfigurationError extends Error {
  constructor(message = "Dashboard memory store configuration is unavailable.") {
    super(message);
    this.name = "DashboardMemoryConfigurationError";
  }
}

export class DashboardMemoryBackend {
  private readonly storeFactory: DashboardMemoryStoreFactory;
  private bindingPromise: Promise<DashboardMemoryStoreBinding> | undefined;
  private seedPromise: Promise<void> | undefined;
  private traceIds: string[] = [];

  constructor(
    storeOrFactory: MemoryStore | DashboardMemoryStoreFactory =
      createDefaultDashboardMemoryStoreBinding,
    options: DashboardMemoryBackendOptions = {}
  ) {
    if (typeof storeOrFactory === "function") {
      this.storeFactory = storeOrFactory;
      return;
    }

    const binding: DashboardMemoryStoreBinding = {
      store: storeOrFactory,
      mode: options.mode ?? "server_in_memory",
      scope: options.scope ?? DEFAULT_SCOPE,
      seedDemoData: options.seedDemoData ?? options.scope === undefined,
      loadMemories: options.loadMemories,
      loadTraces: options.loadTraces
    };
    this.storeFactory = () => binding;
  }

  async listDashboard(): Promise<DashboardSnapshot> {
    const binding = await this.getReadyBinding();
    const { scope, store } = binding;

    const [memories, events, traces, conflicts] = await Promise.all([
      this.listScopedMemories(binding),
      store.listEvents({ tenantId: scope.tenantId }),
      this.listScopedTraces(binding),
      store.listConflicts({ tenantId: scope.tenantId, statuses: ["open"] })
    ]);

    return toDashboardSnapshot({
      runtimeMode: binding.mode,
      memories,
      events,
      traces,
      conflicts
    });
  }

  async updateMemory(memoryId: string, patch: MemoryPatch): Promise<DashboardMemoryRecord> {
    const binding = await this.getReadyBinding();

    const current = await this.requireVisibleMemory(binding, memoryId);
    const result = await binding.store.updateMemory(
      memoryId,
      toCoreMemoryPatch(patch, current),
      {
        actor: DASHBOARD_ACTOR,
        reason: "Edited from Memory Vault dashboard.",
        metadata: { dashboardAction: "update" }
      }
    );

    return this.toDashboardMemoryWithEventCount(binding.store, result.memory);
  }

  async approveMemory(memoryId: string): Promise<DashboardMemoryRecord> {
    const binding = await this.getReadyBinding();

    const current = await this.requireVisibleMemory(binding, memoryId);
    const result = await binding.store.updateMemory(
      memoryId,
      {
        status: "active",
        metadata: {
          ...current.metadata,
          approvalMode: "user_confirmed"
        }
      },
      {
        actor: DASHBOARD_ACTOR,
        reason: "Approved from Pending Memories review.",
        metadata: { dashboardAction: "approve" }
      }
    );

    return this.toDashboardMemoryWithEventCount(binding.store, result.memory);
  }

  async invalidateMemory(memoryId: string, reason: string): Promise<DashboardMemoryRecord> {
    const binding = await this.getReadyBinding();

    const current = await this.requireVisibleMemory(binding, memoryId);
    const now = new Date();
    const normalizedReason = reason.trim() || "Invalidated from Memory Vault dashboard.";
    const result = await binding.store.updateMemory(
      memoryId,
      {
        status: "invalidated",
        validUntil: now,
        metadata: {
          ...current.metadata,
          validityReason: normalizedReason
        }
      },
      {
        actor: DASHBOARD_ACTOR,
        now,
        reason: normalizedReason,
        metadata: { dashboardAction: "invalidate" }
      }
    );

    return this.toDashboardMemoryWithEventCount(binding.store, result.memory);
  }

  async deleteMemory(memoryId: string, reason: string): Promise<void> {
    const binding = await this.getReadyBinding();
    await this.requireVisibleMemory(binding, memoryId);

    await binding.store.deleteMemory(memoryId, {
      actor: DASHBOARD_ACTOR,
      reason: reason.trim() || "Deleted from Memory Vault dashboard.",
      metadata: { dashboardAction: "delete" }
    });
  }

  private async getReadyBinding(): Promise<DashboardMemoryStoreBinding> {
    const binding = await this.getBinding();

    if (binding.seedDemoData) {
      this.seedPromise ??= this.seed(binding.store).catch((error: unknown) => {
        this.seedPromise = undefined;
        throw error;
      });
      await this.seedPromise;
    }

    return binding;
  }

  private getBinding(): Promise<DashboardMemoryStoreBinding> {
    this.bindingPromise ??= Promise.resolve()
      .then(() => this.storeFactory())
      .then((binding) => validateStoreBinding(binding))
      .catch((error: unknown) => {
        this.bindingPromise = undefined;

        if (error instanceof DashboardMemoryConfigurationError) {
          throw error;
        }

        throw new DashboardMemoryConfigurationError();
      });

    return this.bindingPromise;
  }

  private async seed(store: MemoryStore): Promise<void> {
    for (const seedMemory of seedMemories) {
      await store.addMemory(seedMemory.input, {
        actor: { type: "agent", id: seedMemory.actorId ?? "dashboard-seed" },
        reason: seedMemory.reason,
        now: new Date(seedMemory.now)
      });
    }

    await store.updateMemory(
      "mem_expired_006",
      {
        status: "superseded",
        supersededBy: "mem_user_pref_001",
        metadata: {
          provider: "qwen",
          sourceLabel: "Superseded prioritization note",
          runId: "run_2026_0705_01",
          validityReason: "Superseded by stronger user preference memory."
        }
      },
      {
        actor: { type: "system", id: "conflict-check" },
        reason: "Superseded by mem_user_pref_001.",
        now: new Date("2026-07-06T10:20:00.000Z")
      }
    );

    await store.addConflict(seedConflict, {
      actor: { type: "system", id: "conflict-check" },
      reason: seedConflict.reason,
      now: new Date("2026-07-06T10:21:00.000Z")
    });

    await this.seedRunsAndTraces(store);
  }

  private async seedRunsAndTraces(store: MemoryStore): Promise<void> {
    await store.addRun({
      id: "run_2026_0706_02",
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_demo",
      hostId: "codex",
      agentProfileId: "opportunity-scout",
      projectId: "ai-event-2026",
      taskHint: "Rank Qwen, TRAE, and CockroachDB opportunities for this user.",
      startedAt: "2026-07-06T14:10:00.000Z",
      metadata: {}
    });
    await store.addRun({
      id: "run_2026_0706_03",
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_demo",
      hostId: "claude-code",
      agentProfileId: "opportunity-scout",
      projectId: "ai-event-2026",
      taskHint: "Reflect on a recommendation that failed eligibility checks.",
      startedAt: "2026-07-06T15:24:00.000Z",
      metadata: {}
    });

    const traces = await Promise.all([
      store.addTrace({
        id: "trace_0706_02",
        tenantId: DEFAULT_TENANT_ID,
        runId: "run_2026_0706_02",
        query: "Rank Qwen, TRAE, and CockroachDB opportunities for this user.",
        selectedMemoryIds: ["mem_user_pref_001", "mem_proc_002"],
        ignoredMemoryIds: ["mem_tool_003"],
        contextPack:
          "Use confirmed preference for AI agent or memory-focused hackathons. Prioritize credentials, network, and startup resources. Verify deadlines, eligibility region, official rules, and timezone before ranking.",
        selectionReasons: {
          mem_user_pref_001: "Directly determines ranking criteria.",
          mem_proc_002: "Required safety check before producing recommendations.",
          mem_tool_003: "No Devpost page was used in this run.",
          mem_expired_006: "Superseded by a directly confirmed preference."
        },
        metadata: traceMetadata({
          hostId: "codex",
          agentProfileId: "opportunity-scout",
          project_id: "ai-event-2026",
          recall_mode: "memory_recall",
          context_budget_tokens: 640,
          decision_stage: "opportunity ranking",
          excludedMemoryIds: ["mem_expired_006"],
          scores: {
            mem_user_pref_001: 0.92,
            mem_proc_002: 0.88,
            mem_tool_003: 0.44,
            mem_expired_006: 0.12
          }
        })
      }),
      store.addTrace({
        id: "trace_0706_03",
        tenantId: DEFAULT_TENANT_ID,
        runId: "run_2026_0706_03",
        query: "Reflect on a recommendation that failed eligibility checks.",
        selectedMemoryIds: ["mem_proc_002"],
        ignoredMemoryIds: [],
        contextPack:
          "The user cares about region eligibility. Convert event deadlines to the planning timezone and record failure memories as pending until reviewed.",
        selectionReasons: {
          mem_proc_002: "Matched the failed recommendation pattern."
        },
        metadata: traceMetadata({
          hostId: "claude-code",
          agentProfileId: "opportunity-scout",
          project_id: "ai-event-2026",
          recall_mode: "memory_reflect",
          review_mode: "pending failure memory",
          context_budget_tokens: 420,
          scores: {
            mem_proc_002: 0.9
          }
        })
      })
    ]);

    this.traceIds = traces.map((trace) => trace.id);
  }

  private async listSeededTraces(store: MemoryStore): Promise<MemoryTrace[]> {
    const traces = await Promise.all(this.traceIds.map((traceId) => store.getTrace(traceId)));
    return traces.filter((trace): trace is MemoryTrace => trace !== undefined);
  }

  private async listScopedTraces(
    binding: DashboardMemoryStoreBinding
  ): Promise<MemoryTrace[]> {
    const traces = binding.loadTraces
      ? await binding.loadTraces({ store: binding.store, scope: binding.scope })
      : await this.listSeededTraces(binding.store);
    const scopedTraces = await Promise.all(
      traces.map(async (trace) => {
        if (trace.tenantId !== binding.scope.tenantId || !trace.runId) {
          return undefined;
        }

        const run = await binding.store.getRun(trace.runId);
        return run && runMatchesScope(run, binding.scope) ? trace : undefined;
      })
    );

    return scopedTraces.filter((trace): trace is MemoryTrace => trace !== undefined);
  }

  private async listScopedMemories(
    binding: DashboardMemoryStoreBinding
  ): Promise<CoreMemoryRecord[]> {
    const memories = binding.loadMemories
      ? await binding.loadMemories({ store: binding.store, scope: binding.scope })
      : await binding.store.listMemories({
          ...(binding.mode === "shared_persistent_store"
            ? { scope: binding.scope }
            : {}),
          includeExpiredByValidity: true
        });

    return memories.filter((memory) => memoryMatchesScope(memory, binding.scope));
  }

  private async requireVisibleMemory(
    binding: DashboardMemoryStoreBinding,
    memoryId: string
  ): Promise<CoreMemoryRecord> {
    const memory = await binding.store.getMemory(memoryId);

    if (
      !memory ||
      !memoryMatchesScope(memory, binding.scope) ||
      !isDashboardVisibleMemory(memory)
    ) {
      throw new DashboardMemoryNotFoundError(memoryId);
    }

    return memory;
  }

  private async toDashboardMemoryWithEventCount(
    store: MemoryStore,
    memory: CoreMemoryRecord
  ): Promise<DashboardMemoryRecord> {
    const events = await store.listEvents({ memoryId: memory.id });
    return toDashboardMemory(memory, events.length);
  }
}

type GlobalDashboardMemoryState = typeof globalThis & {
  __handoffbaseDashboardMemoryBackend?: DashboardMemoryBackend;
  __handoffbaseDashboardMemoryStoreFactory?: DashboardMemoryStoreFactory;
};

export function createDefaultDashboardMemoryStoreBinding(): DashboardMemoryStoreBinding {
  return {
    store: new InMemoryMemoryStore(),
    mode: "server_in_memory",
    scope: { ...DEFAULT_SCOPE },
    seedDemoData: true
  };
}

export function getDashboardMemoryBackend(): DashboardMemoryBackend {
  const globalState = globalThis as GlobalDashboardMemoryState;

  globalState.__handoffbaseDashboardMemoryBackend ??= new DashboardMemoryBackend(
    globalState.__handoffbaseDashboardMemoryStoreFactory ??
      createDefaultDashboardMemoryStoreBinding
  );

  return globalState.__handoffbaseDashboardMemoryBackend;
}

export function configureDashboardMemoryStoreFactory(
  factory: DashboardMemoryStoreFactory
): void {
  const globalState = globalThis as GlobalDashboardMemoryState;

  if (globalState.__handoffbaseDashboardMemoryBackend) {
    throw new DashboardMemoryConfigurationError(
      "Configure the dashboard memory store factory before the first API request."
    );
  }

  globalState.__handoffbaseDashboardMemoryStoreFactory = factory;
}

export function resetDashboardMemoryBackendForTest(
  storeOrFactory: MemoryStore | DashboardMemoryStoreFactory =
    createDefaultDashboardMemoryStoreBinding,
  options: DashboardMemoryBackendOptions = {}
): DashboardMemoryBackend {
  const globalState = globalThis as GlobalDashboardMemoryState;
  delete globalState.__handoffbaseDashboardMemoryStoreFactory;
  globalState.__handoffbaseDashboardMemoryBackend = new DashboardMemoryBackend(
    storeOrFactory,
    options
  );

  return globalState.__handoffbaseDashboardMemoryBackend;
}

function validateStoreBinding(
  binding: DashboardMemoryStoreBinding
): DashboardMemoryStoreBinding {
  if (!binding?.store) {
    throw new DashboardMemoryConfigurationError(
      "The dashboard memory store factory did not return a store."
    );
  }

  if (
    binding.mode !== "server_in_memory" &&
    binding.mode !== "shared_persistent_store"
  ) {
    throw new DashboardMemoryConfigurationError(
      "The dashboard memory store factory returned an unsupported mode."
    );
  }

  if (!binding.scope?.tenantId.trim() || !binding.scope.userId.trim()) {
    throw new DashboardMemoryConfigurationError(
      "The dashboard memory store factory must provide a tenant and user scope."
    );
  }

  if (binding.mode === "shared_persistent_store" && binding.seedDemoData) {
    throw new DashboardMemoryConfigurationError(
      "Shared persistent stores cannot enable dashboard demo seeding."
    );
  }

  if (
    binding.seedDemoData &&
    (binding.scope.tenantId !== DEFAULT_SCOPE.tenantId ||
      binding.scope.userId !== DEFAULT_SCOPE.userId)
  ) {
    throw new DashboardMemoryConfigurationError(
      "Dashboard demo seeding requires the built-in demo scope."
    );
  }

  return {
    ...binding,
    scope: { ...binding.scope }
  };
}

function memoryMatchesScope(
  memory: CoreMemoryRecord,
  scope: MemoryScopeFilter
): boolean {
  const scopeEntries = Object.entries(scope) as Array<
    [keyof MemoryScopeFilter, string | undefined]
  >;

  return scopeEntries.every(
    ([key, value]) => value === undefined || memory.scope[key] === value
  );
}

function runMatchesScope(run: RunRecord, scope: MemoryScopeFilter): boolean {
  if (run.tenantId !== scope.tenantId || run.userId !== scope.userId) {
    return false;
  }

  if (scope.sessionId !== undefined || scope.toolId !== undefined) {
    return false;
  }

  return (
    (scope.agentProfileId === undefined ||
      run.agentProfileId === scope.agentProfileId) &&
    (scope.projectId === undefined || run.projectId === scope.projectId) &&
    (scope.hostId === undefined || run.hostId === scope.hostId)
  );
}

function traceMetadata(metadata: JsonObject): JsonObject {
  return metadata;
}

const seedMemories: Array<{
  input: CreateMemoryInput;
  now: string;
  reason: string;
  actorId?: string;
}> = [
  {
    now: "2026-07-06T10:15:00.000Z",
    reason: "Extracted durable user preference from correction.",
    actorId: "opportunity-scout",
    input: {
      id: "mem_user_pref_001",
      type: "user_preference",
      scope: {
        tenantId: DEFAULT_TENANT_ID,
        userId: "user_demo",
        agentProfileId: "opportunity-scout",
        hostId: "codex"
      },
      sourceKind: "user_correction",
      status: "active",
      confidence: 0.96,
      importance: 0.9,
      validFrom: "2026-07-06T10:12:00.000Z",
      canonicalText:
        "User prioritizes AI hackathons that improve credentials, founder network, and useful startup resources over prize money alone.",
      rawSource:
        "I want AI hackathons that improve credentials and network, not only prize money.",
      metadata: {
        provider: "qwen",
        approvalMode: "user_confirmed",
        sourceLabel: "Session 1 preference correction",
        runId: "run_2026_0706_01",
        validityReason: "Confirmed directly by the user."
      }
    }
  },
  {
    now: "2026-07-06T11:05:00.000Z",
    reason: "Generated after post-run reflection.",
    actorId: "qwen-provider",
    input: {
      id: "mem_proc_002",
      type: "procedure",
      scope: {
        tenantId: DEFAULT_TENANT_ID,
        userId: "user_demo",
        agentProfileId: "opportunity-scout",
        projectId: "ai-event-2026"
      },
      sourceKind: "run_reflection",
      status: "active",
      confidence: 0.93,
      importance: 0.88,
      validFrom: "2026-07-06T11:00:00.000Z",
      canonicalText:
        "Before recommending a hackathon, verify registration deadline, timezone, eligibility region, and official rules.",
      metadata: {
        provider: "qwen",
        policyGate: "approved",
        sourceLabel: "Post-run reflection",
        runId: "run_2026_0706_02",
        validityReason: "Repeated failure prevention procedure."
      }
    }
  },
  {
    now: "2026-07-06T11:45:00.000Z",
    reason: "Generated after Devpost inspection.",
    actorId: "qwen-provider",
    input: {
      id: "mem_tool_003",
      type: "tool_memory",
      scope: {
        tenantId: DEFAULT_TENANT_ID,
        userId: "user_demo",
        agentProfileId: "opportunity-scout",
        toolId: "devpost"
      },
      sourceKind: "run_reflection",
      status: "active",
      confidence: 0.86,
      importance: 0.67,
      validFrom: "2026-07-06T11:42:00.000Z",
      canonicalText:
        "Devpost deadlines are often shown in Pacific Time; convert them before comparing against Asia/Shanghai planning dates.",
      metadata: {
        provider: "qwen",
        tool: "devpost",
        sourceLabel: "Devpost inspection result",
        runId: "run_2026_0706_02",
        validityReason: "Tool behavior observed during current demo data collection."
      }
    }
  },
  {
    now: "2026-07-06T15:24:00.000Z",
    reason: "Candidate failure memory requires review.",
    actorId: "qwen-provider",
    input: {
      id: "mem_pending_004",
      type: "failure_memory",
      scope: {
        tenantId: DEFAULT_TENANT_ID,
        userId: "user_demo",
        agentProfileId: "opportunity-scout",
        projectId: "ai-event-2026"
      },
      sourceKind: "run_reflection",
      status: "pending",
      confidence: 0.82,
      importance: 0.78,
      validFrom: "2026-07-06T15:20:00.000Z",
      canonicalText:
        "Do not recommend competitions when official eligibility excludes the user's region; verify rules before ranking.",
      rawSource:
        "The user corrected a recommendation because the event did not allow China or Hong Kong participation.",
      metadata: {
        provider: "qwen",
        approvalMode: "pending",
        sourceLabel: "Eligibility mistake reflection",
        runId: "run_2026_0706_03",
        validityReason: "Needs user approval because it changes future recommendations."
      }
    }
  },
  {
    now: SEED_NOW,
    reason: "Candidate ranking procedure requires review.",
    actorId: "qwen-provider",
    input: {
      id: "mem_pending_005",
      type: "procedure",
      scope: {
        tenantId: DEFAULT_TENANT_ID,
        userId: "user_demo",
        agentProfileId: "opportunity-scout",
        projectId: "ai-event-2026",
        hostId: "codex"
      },
      sourceKind: "run_reflection",
      status: "pending",
      confidence: 0.84,
      importance: 0.72,
      validFrom: SEED_NOW,
      canonicalText:
        "When eligible opportunities compete, rank founder network, credentials, mentor access, and startup resources above cash-only prize size.",
      rawSource:
        "Qwen extracted this after the user corrected a prize-first ranking and emphasized credentials, network, and startup resources.",
      metadata: {
        provider: "qwen",
        approvalMode: "pending",
        sourceLabel: "Ranking rule extraction",
        runId: "run_2026_0706_03",
        validityReason: "Needs user approval before it changes ranking behavior."
      }
    }
  },
  {
    now: "2026-07-05T08:20:00.000Z",
    reason: "Imported older prioritization note.",
    actorId: "opportunity-scout",
    input: {
      id: "mem_expired_006",
      type: "decision_memory",
      scope: {
        tenantId: DEFAULT_TENANT_ID,
        userId: "user_demo",
        agentProfileId: "opportunity-scout"
      },
      sourceKind: "run_reflection",
      status: "active",
      confidence: 0.69,
      importance: 0.3,
      validFrom: "2026-07-05T08:00:00.000Z",
      validUntil: "2026-07-06T10:15:00.000Z",
      canonicalText:
        "User appears to prioritize hackathon prize money when choosing opportunities.",
      metadata: {
        provider: "qwen",
        sourceLabel: "Superseded prioritization note",
        runId: "run_2026_0705_01",
        validityReason: "Superseded by stronger user preference memory."
      }
    }
  }
];

const seedConflict: AddMemoryConflictInput = {
  id: "conflict_001",
  tenantId: DEFAULT_TENANT_ID,
  candidateMemoryId: "mem_user_pref_001",
  existingMemoryId: "mem_expired_006",
  conflictType: "supersedes",
  severity: "high",
  recommendedAction: "supersede_existing",
  reason:
    "The user-confirmed preference supersedes the older prize-first inference.",
  confidence: 0.96,
  metadata: {
    provider: "qwen",
    source: "dashboard-demo"
  }
};
