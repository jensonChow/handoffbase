import {
  InMemoryMemoryStore,
  PostgresMemoryStore,
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type JsonObject,
  type MemoryConflictRecord,
  type MemoryEvent,
  type MemoryFeedbackRecord,
  type MemoryRecord as CoreMemoryRecord,
  type MemoryScope,
  type MemoryScopeFilter,
  type MemoryStore,
  type MemoryTrace,
  type RunRecord,
  type SqlQueryClient
} from "@handoffbase/memory-core";
import type {
  ConflictResolutionInput,
  ConflictResolutionResult,
  DashboardSnapshot,
  DashboardRuntimeMode,
  MemoryPatch,
  MemoryRecord as DashboardMemoryRecord,
  TraceFeedback,
  TraceFeedbackInput
} from "@/lib/memory-client";
import {
  isDashboardVisibleMemory,
  toDashboardMemory,
  toDashboardFeedback,
  toDashboardSnapshot
} from "./dashboard-memory-mappers";
import {
  createDashboardPgSqlQueryClient,
  loadScopedPostgresTraces
} from "./dashboard-postgres";
import { ContinuityMemoryService } from "../../../../../src/services/continuity-memory-service";
import { withCallerContext } from "../../../../../src/services/memory-service";
import type { CallerContext } from "../../../../../src/auth/types";

const DEFAULT_TENANT_ID = "demo-tenant";
const DEFAULT_SCOPE: MemoryScopeFilter = {
  tenantId: DEFAULT_TENANT_ID,
  userId: "demo-user"
};
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
  scope?: Partial<MemoryScopeFilter>;
  seedDemoData: boolean;
  loadMemories?: DashboardMemoryLoader;
  loadTraces?: DashboardTraceLoader;
};

export type DashboardMemoryStoreFactory = () =>
  | DashboardMemoryStoreBinding
  | Promise<DashboardMemoryStoreBinding>;

export type DashboardPostgresClientFactory = (
  databaseUrl: string
) => SqlQueryClient | Promise<SqlQueryClient>;

export type DashboardStoreEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type DashboardMemoryBackendOptions = Partial<
  Omit<DashboardMemoryStoreBinding, "store">
>;

export class DashboardMemoryNotFoundError extends Error {
  constructor(memoryId: string) {
    super(`Memory ${memoryId} was not found.`);
    this.name = "DashboardMemoryNotFoundError";
  }
}

export class DashboardInvalidMemoryStateError extends Error {
  constructor(memoryId: string, expected: string, actual: string) {
    super(`Memory ${memoryId} must be ${expected}; current status is ${actual}.`);
    this.name = "DashboardInvalidMemoryStateError";
  }
}

export class DashboardConflictNotFoundError extends Error {
  constructor(conflictId: string) {
    super(`Conflict ${conflictId} was not found.`);
    this.name = "DashboardConflictNotFoundError";
  }
}

export class DashboardTraceNotFoundError extends Error {
  constructor(traceId: string) {
    super(`Trace ${traceId} was not found.`);
    this.name = "DashboardTraceNotFoundError";
  }
}

export class DashboardAuthorizationError extends Error {
  constructor(message = "This dashboard session is outside the configured deployment scope.") {
    super(message);
    this.name = "DashboardAuthorizationError";
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
  private service: ContinuityMemoryService | undefined;
  private serviceStore: MemoryStore | undefined;
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
      scope: options.scope,
      seedDemoData: options.seedDemoData ?? options.scope === undefined,
      loadMemories: options.loadMemories,
      loadTraces: options.loadTraces
    };
    this.storeFactory = () => binding;
  }

  async listDashboard(caller: CallerContext): Promise<DashboardSnapshot> {
    const binding = await this.getReadyBinding();
    const { store } = binding;
    const scope = dashboardScope(binding, caller);

    const [memories, scopedEvents, traces, tenantConflicts, feedback] = await Promise.all([
      this.listScopedMemories(binding, scope, caller),
      store.listEvents({ scope }),
      this.listScopedTraces(binding, scope, caller),
      store.listConflicts({ tenantId: scope.tenantId, statuses: ["open"] }),
      store.listFeedback({ scope })
    ]);
    const readableMemoryIds = new Set(memories.map((memory) => memory.id));
    const events = scopedEvents.filter(
      (event) =>
        event.memoryId !== undefined &&
        (readableMemoryIds.has(event.memoryId) ||
          deleteEventScopeAllowed(event, scope, caller))
    );
    const conflicts = tenantConflicts.filter((conflict) =>
      conflictLinksAreReadable(conflict, readableMemoryIds)
    );
    const traceIds = new Set(traces.map((trace) => trace.id));
    const visibleFeedback = feedback.filter(
      (item) =>
        memoryScopeAllowed(item.scope, scope, caller) &&
        (item.traceId === undefined || traceIds.has(item.traceId)) &&
        (item.memoryId === undefined || readableMemoryIds.has(item.memoryId))
    );

    return toDashboardSnapshot({
      runtimeMode: binding.mode,
      memories,
      events,
      traces,
      conflicts,
      feedback: visibleFeedback
    });
  }

  async updateMemory(
    memoryId: string,
    patch: MemoryPatch,
    caller: CallerContext
  ): Promise<DashboardMemoryRecord> {
    const binding = await this.getReadyBinding();
    const current = await this.requireVisibleMemory(binding, memoryId, caller);
    const service = this.callerBoundService(binding, caller);
    await service.update({
      memory_id: memoryId,
      patch: {
        text: patch.canonicalText,
        confidence: patch.confidence,
        importance: patch.importance,
        valid_from: patch.validity?.validFrom,
        valid_until: patch.validity?.validUntil,
        metadata:
          patch.validity?.reason === undefined
            ? undefined
            : {
                ...current.metadata,
                validityReason: patch.validity.reason
              }
      },
      reason: "Edited from HandoffBase Memory Vault."
    });
    return this.toDashboardMemoryWithEventCount(
      binding.store,
      await this.requireVisibleMemory(binding, memoryId, caller)
    );
  }

  async approveMemory(
    memoryId: string,
    caller: CallerContext
  ): Promise<DashboardMemoryRecord> {
    const binding = await this.getReadyBinding();
    const current = await this.requireVisibleMemory(binding, memoryId, caller);
    if (current.status !== "pending") {
      throw new DashboardInvalidMemoryStateError(
        memoryId,
        "pending before approval",
        current.status
      );
    }
    await this.callerBoundService(binding, caller).update({
      memory_id: memoryId,
      expected_status: "pending",
      patch: {
        status: "active",
        metadata: {
          ...current.metadata,
          approvalMode: "user_confirmed"
        }
      },
      reason: "Approved from HandoffBase pending memory review."
    });
    return this.toDashboardMemoryWithEventCount(
      binding.store,
      await this.requireVisibleMemory(binding, memoryId, caller)
    );
  }

  async invalidateMemory(
    memoryId: string,
    reason: string,
    caller: CallerContext
  ): Promise<DashboardMemoryRecord> {
    const binding = await this.getReadyBinding();
    await this.requireVisibleMemory(binding, memoryId, caller);
    const normalizedReason = reason.trim();
    const service = this.callerBoundService(binding, caller);
    await service.forget({
      memory_id: memoryId,
      mode: "invalidate",
      reason: normalizedReason
    });
    return this.toDashboardMemoryWithEventCount(
      binding.store,
      await this.requireVisibleMemory(binding, memoryId, caller)
    );
  }

  async deleteMemory(
    memoryId: string,
    reason: string,
    caller: CallerContext
  ): Promise<void> {
    const binding = await this.getReadyBinding();
    await this.requireVisibleMemory(binding, memoryId, caller);
    await this.callerBoundService(binding, caller).forget({
      memory_id: memoryId,
      mode: "hard_delete",
      reason: reason.trim()
    });
  }

  async resolveConflict(
    conflictId: string,
    input: ConflictResolutionInput,
    caller: CallerContext
  ): Promise<ConflictResolutionResult> {
    const binding = await this.getReadyBinding();
    await this.requireVisibleConflict(binding, conflictId, caller);
    const result = await this.callerBoundService(binding, caller).resolveConflict({
      conflict_id: conflictId,
      action: input.action,
      merged_text: input.mergedText,
      reason: input.reason
    });
    return {
      conflictId: result.conflict_id,
      action: result.action,
      status: result.conflict_status,
      eventIds: result.event_ids,
      resolvedAt: result.resolved_at
    };
  }

  async submitTraceFeedback(
    traceId: string,
    input: TraceFeedbackInput,
    caller: CallerContext
  ): Promise<TraceFeedback> {
    const binding = await this.getReadyBinding();
    const trace = await this.requireVisibleTrace(binding, traceId, caller);
    const reason = [input.reason, input.outcome ? `Outcome: ${input.outcome}` : undefined]
      .filter((item): item is string => Boolean(item))
      .join("\n");
    const result = await this.callerBoundService(binding, caller).feedback({
      trace_id: traceId,
      signal: input.rating,
      reason: reason || undefined,
      correction: input.correction,
      run_id: trace.runId
    });
    const feedback = await binding.store.getFeedback(result.feedback_id);
    if (!feedback) {
      throw new Error(`Feedback ${result.feedback_id} was not persisted.`);
    }
    return toDashboardFeedback(feedback);
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
      userId: "demo-user",
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
      userId: "demo-user",
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
    binding: DashboardMemoryStoreBinding,
    scope: MemoryScopeFilter,
    caller: CallerContext
  ): Promise<MemoryTrace[]> {
    const traces = binding.loadTraces
      ? await binding.loadTraces({ store: binding.store, scope })
      : await this.listSeededTraces(binding.store);
    const scopedTraces = await Promise.all(
      traces.map(async (trace) => {
        if (trace.tenantId !== scope.tenantId || !trace.runId) {
          return undefined;
        }

        const run = await binding.store.getRun(trace.runId);
        return run && runMatchesScope(run, scope) && runAllowedForCaller(run, caller)
          ? trace
          : undefined;
      })
    );

    return scopedTraces.filter((trace): trace is MemoryTrace => trace !== undefined);
  }

  private async listScopedMemories(
    binding: DashboardMemoryStoreBinding,
    scope: MemoryScopeFilter,
    caller: CallerContext
  ): Promise<CoreMemoryRecord[]> {
    const memories = binding.loadMemories
      ? await binding.loadMemories({ store: binding.store, scope })
      : binding.store instanceof InMemoryMemoryStore
        ? await binding.store.listMemories({ includeExpiredByValidity: true })
        : await binding.store.listMemories({
            scope: { tenantId: scope.tenantId, userId: scope.userId },
            includeExpiredByValidity: true
          });

    return memories.filter((memory) => memoryScopeAllowed(memory.scope, scope, caller));
  }

  private async requireVisibleMemory(
    binding: DashboardMemoryStoreBinding,
    memoryId: string,
    caller: CallerContext
  ): Promise<CoreMemoryRecord> {
    const memory = await binding.store.getMemory(memoryId);
    const scope = dashboardScope(binding, caller);

    if (
      !memory ||
      !memoryScopeAllowed(memory.scope, scope, caller) ||
      !isDashboardVisibleMemory(memory)
    ) {
      throw new DashboardMemoryNotFoundError(memoryId);
    }

    return memory;
  }

  private async requireVisibleConflict(
    binding: DashboardMemoryStoreBinding,
    conflictId: string,
    caller: CallerContext
  ): Promise<MemoryConflictRecord> {
    const conflict = await binding.store.getConflict(conflictId);
    const scope = dashboardScope(binding, caller);
    if (!conflict || conflict.tenantId !== scope.tenantId) {
      throw new DashboardConflictNotFoundError(conflictId);
    }
    const linkedIds = [conflict.candidateMemoryId, conflict.existingMemoryId].filter(
      (id): id is string => Boolean(id)
    );
    const linked = await Promise.all(linkedIds.map((id) => binding.store.getMemory(id)));
    if (
      linked.length === 0 ||
      linked.some(
        (memory) => !memory || !memoryScopeAllowed(memory.scope, scope, caller)
      )
    ) {
      throw new DashboardConflictNotFoundError(conflictId);
    }
    return conflict;
  }

  private async requireVisibleTrace(
    binding: DashboardMemoryStoreBinding,
    traceId: string,
    caller: CallerContext
  ): Promise<MemoryTrace> {
    const trace = await binding.store.getTrace(traceId);
    const scope = dashboardScope(binding, caller);
    if (!trace || trace.tenantId !== scope.tenantId || !trace.runId) {
      throw new DashboardTraceNotFoundError(traceId);
    }
    const run = await binding.store.getRun(trace.runId);
    if (!run || !runMatchesScope(run, scope) || !runAllowedForCaller(run, caller)) {
      throw new DashboardTraceNotFoundError(traceId);
    }
    return trace;
  }

  private callerBoundService(
    binding: DashboardMemoryStoreBinding,
    caller: CallerContext
  ) {
    if (!this.service || this.serviceStore !== binding.store) {
      this.service = new ContinuityMemoryService({
        store: binding.store,
        seedDemoMemories: false
      });
      this.serviceStore = binding.store;
    }
    return withCallerContext(this.service, caller);
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

export function createDefaultDashboardMemoryStoreBinding(): Promise<DashboardMemoryStoreBinding> {
  return createDashboardMemoryStoreBindingFromEnvironment();
}

export async function createDashboardMemoryStoreBindingFromEnvironment(
  env: DashboardStoreEnvironment = process.env,
  createPostgresClient: DashboardPostgresClientFactory =
    createDashboardPgSqlQueryClient
): Promise<DashboardMemoryStoreBinding> {
  const storeMode = readOptionalEnvironmentValue(env.STORE_MODE) ?? "in-memory";

  if (storeMode === "in-memory") {
    return {
      store: new InMemoryMemoryStore(),
      mode: "server_in_memory",
      seedDemoData: true
    };
  }

  if (storeMode !== "postgres") {
    throw new DashboardMemoryConfigurationError(
      "STORE_MODE must be one of: in-memory, postgres."
    );
  }

  const databaseUrl = requireEnvironmentValue(
    env.DATABASE_URL,
    "DATABASE_URL is required when STORE_MODE=postgres."
  );
  const scope: Partial<MemoryScopeFilter> = {};

  setOptionalScopeValue(scope, "tenantId", env.HANDOFFBASE_DASHBOARD_TENANT_ID);
  setOptionalScopeValue(scope, "userId", env.HANDOFFBASE_DASHBOARD_USER_ID);
  setOptionalScopeValue(
    scope,
    "agentProfileId",
    env.HANDOFFBASE_DASHBOARD_AGENT_PROFILE_ID
  );
  setOptionalScopeValue(scope, "projectId", env.HANDOFFBASE_DASHBOARD_PROJECT_ID);
  setOptionalScopeValue(scope, "hostId", env.HANDOFFBASE_DASHBOARD_HOST_ID);

  const client = await createPostgresClient(databaseUrl);

  return {
    store: new PostgresMemoryStore(client),
    mode: "shared_persistent_store",
    scope,
    seedDemoData: false,
    loadTraces: ({ scope: traceScope }) =>
      loadScopedPostgresTraces(client, traceScope)
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

  if (binding.mode === "shared_persistent_store" && binding.seedDemoData) {
    throw new DashboardMemoryConfigurationError(
      "Shared persistent stores cannot enable dashboard demo seeding."
    );
  }

  if (
    binding.seedDemoData &&
    ((binding.scope?.tenantId !== undefined &&
      binding.scope.tenantId !== DEFAULT_SCOPE.tenantId) ||
      (binding.scope?.userId !== undefined &&
        binding.scope.userId !== DEFAULT_SCOPE.userId))
  ) {
    throw new DashboardMemoryConfigurationError(
      "Dashboard demo seeding requires the built-in demo scope."
    );
  }

  return {
    ...binding,
    scope: binding.scope ? { ...binding.scope } : undefined
  };
}

function memoryMatchesScope(
  memory: Pick<CoreMemoryRecord, "scope">,
  scope: MemoryScopeFilter
): boolean {
  const scopeEntries = Object.entries(scope) as Array<
    [keyof MemoryScopeFilter, string | undefined]
  >;

  return scopeEntries.every(([key, value]) => {
    if (value === undefined) {
      return true;
    }

    const memoryValue = memory.scope[key];
    return memoryValue === undefined || memoryValue === value;
  });
}

function dashboardScope(
  binding: DashboardMemoryStoreBinding,
  caller: CallerContext
): MemoryScopeFilter {
  if (
    (binding.scope?.tenantId && binding.scope.tenantId !== caller.tenantId) ||
    (binding.scope?.userId && binding.scope.userId !== caller.userId)
  ) {
    throw new DashboardAuthorizationError();
  }
  return {
    tenantId: caller.tenantId,
    userId: caller.userId,
    agentProfileId: dashboardScopeDimension(
      binding.scope?.agentProfileId,
      caller.allowedAgentProfileIds,
      "agent profile"
    ),
    projectId: dashboardScopeDimension(
      binding.scope?.projectId,
      caller.allowedProjectIds,
      "project"
    ),
    hostId: binding.scope?.hostId
  };
}

function dashboardScopeDimension(
  configured: string | undefined,
  allowed: string[] | undefined,
  label: string
): string | undefined {
  if (configured && allowed && !allowed.includes(configured)) {
    throw new DashboardMemoryConfigurationError(
      `Dashboard ${label} scope is outside the authenticated caller grant.`
    );
  }
  return configured ?? (allowed?.length === 1 ? allowed[0] : undefined);
}

function memoryScopeAllowed(
  memoryScope: MemoryScope,
  scope: MemoryScopeFilter,
  caller: CallerContext
): boolean {
  if (!memoryMatchesScope({ scope: memoryScope }, scope)) {
    return false;
  }
  if (
    caller.allowedAgentProfileIds &&
    (!memoryScope.agentProfileId ||
      !caller.allowedAgentProfileIds.includes(memoryScope.agentProfileId))
  ) {
    return false;
  }
  if (
    caller.allowedProjectIds &&
    (!memoryScope.projectId ||
      !caller.allowedProjectIds.includes(memoryScope.projectId))
  ) {
    return false;
  }
  return true;
}

function deleteEventScopeAllowed(
  event: MemoryEvent,
  scope: MemoryScopeFilter,
  caller: CallerContext
): boolean {
  if (event.eventType !== "delete") {
    return false;
  }
  const snapshotScope = event.after?.scope;
  if (!isJsonRecord(snapshotScope)) {
    return false;
  }
  const tenantId = jsonString(snapshotScope.tenantId);
  const userId = jsonString(snapshotScope.userId);
  if (!tenantId || !userId) {
    return false;
  }
  const deletedScope: MemoryScope = {
    tenantId,
    userId,
    agentProfileId: jsonString(snapshotScope.agentProfileId),
    projectId: jsonString(snapshotScope.projectId),
    hostId: jsonString(snapshotScope.hostId),
    sessionId: jsonString(snapshotScope.sessionId),
    toolId: jsonString(snapshotScope.toolId)
  };
  if (!memoryScopeAllowed(deletedScope, scope, caller)) {
    return false;
  }
  for (const key of [
    "agentProfileId",
    "projectId",
    "hostId",
    "sessionId",
    "toolId"
  ] as const) {
    if (scope[key] !== undefined && deletedScope[key] !== scope[key]) {
      return false;
    }
  }
  return true;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function runAllowedForCaller(run: RunRecord, caller: CallerContext): boolean {
  if (
    caller.allowedAgentProfileIds &&
    (!run.agentProfileId ||
      !caller.allowedAgentProfileIds.includes(run.agentProfileId))
  ) {
    return false;
  }
  if (
    caller.allowedProjectIds &&
    (!run.projectId || !caller.allowedProjectIds.includes(run.projectId))
  ) {
    return false;
  }
  return true;
}

function conflictLinksAreReadable(
  conflict: MemoryConflictRecord,
  readableMemoryIds: Set<string>
): boolean {
  const linkedIds = [conflict.candidateMemoryId, conflict.existingMemoryId].filter(
    (id): id is string => Boolean(id)
  );
  return linkedIds.length > 0 && linkedIds.every((id) => readableMemoryIds.has(id));
}

function runMatchesScope(run: RunRecord, scope: MemoryScopeFilter): boolean {
  if (run.tenantId !== scope.tenantId || run.userId !== scope.userId) {
    return false;
  }

  if (scope.sessionId !== undefined || scope.toolId !== undefined) {
    return false;
  }

  return (
    optionalScopeMatches(run.agentProfileId, scope.agentProfileId) &&
    optionalScopeMatches(run.projectId, scope.projectId) &&
    optionalScopeMatches(run.hostId, scope.hostId)
  );
}

function optionalScopeMatches(
  recordValue: string | undefined,
  filterValue: string | undefined
): boolean {
  return filterValue === undefined || recordValue === filterValue;
}

function traceMetadata(metadata: JsonObject): JsonObject {
  return metadata;
}

function readOptionalEnvironmentValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireEnvironmentValue(value: string | undefined, message: string): string {
  const normalized = readOptionalEnvironmentValue(value);
  if (normalized === undefined) {
    throw new DashboardMemoryConfigurationError(message);
  }

  return normalized;
}

function setOptionalScopeValue(
  scope: Partial<MemoryScopeFilter>,
  key: keyof MemoryScopeFilter,
  value: string | undefined
): void {
  const normalized = readOptionalEnvironmentValue(value);
  if (normalized !== undefined) {
    scope[key] = normalized;
  }
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
        userId: "demo-user",
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
        userId: "demo-user",
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
        userId: "demo-user",
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
        userId: "demo-user",
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
        userId: "demo-user",
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
        userId: "demo-user",
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
