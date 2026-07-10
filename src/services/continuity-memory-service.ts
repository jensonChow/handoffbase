import {
  InMemoryMemoryStore,
  MockMemoryProvider,
  PostgresMemoryStore,
  QwenMemoryProvider,
  QwenProviderError,
  applyMemoryPatch,
  assertMemoryExpectedStatus,
  assessMemorySafety,
  assertNoSensitiveText,
  redactSensitiveText,
  rejectSensitiveText,
  type ConflictResult,
  type ContextPackInput,
  type CreateMemoryInput,
  type JsonObject,
  type JsonValue,
  type MemoryCandidate,
  type MemoryActor,
  type MemoryFeedbackRecord,
  type MemoryConflictRecord,
  type MemoryListFilter,
  type MemoryReasoningProvider,
  type MemoryRecord,
  type MemoryScope,
  type MemorySourceKind,
  type MemoryStatus,
  type MemoryStore,
  type MemoryTrace,
  type MemoryUpdateResult,
  type MemoryWriteResult,
  type RunRecord,
  type SourceKind,
  type SourceTrust,
  type StoredMemory,
  type UpdateMemoryPatch,
} from "@handoffbase/memory-core";
import { randomUUID } from "node:crypto";
import {
  ScopeGuardError,
  applyCallerAllowedDefaults,
  assertScopeAllowed,
  assertScopedRequestNarrowed,
  callerActor,
  isAuthEnforced,
} from "../auth/scope.js";
import type { CallerContext } from "../auth/types.js";
import {
  MemoryResolveConflictInputSchema,
  CandidateMemory,
  ContinuityBootstrapInput,
  ContinuityBootstrapOutput,
  MemoryForgetInput,
  MemoryForgetOutput,
  MemoryFeedbackInput,
  MemoryFeedbackInputSchema,
  MemoryFeedbackOutput,
  MemoryFeedbackRegressionFixture,
  MemoryRecallInput,
  MemoryRecallOutput,
  MemoryReflectInput,
  MemoryReflectOutput,
  MemoryRememberInput,
  MemoryRememberOutput,
  MemoryConflictResolutionAction,
  MemoryResolveConflictInput,
  MemoryResolveConflictOutput,
  MemorySummary,
  MemoryTraceInput,
  MemoryTraceOutput,
  MemoryType,
  MemoryUpdateInput,
  MemoryUpdateOutput,
} from "../schemas.js";
import type {
  MemoryResourceRequest,
  MemoryResourceResult,
  MemoryService,
  MemoryServiceContext,
  MemoryServiceRuntimeInfo,
} from "./memory-service.js";

const DEFAULT_TENANT_ID = "demo-tenant";
const DEFAULT_USER_ID = "demo-user";
const DEFAULT_AGENT_PROFILE_ID = "opportunity-scout";

export interface ContinuityMemoryServiceOptions {
  store?: MemoryStore;
  provider?: MemoryReasoningProvider;
  seedDemoMemories?: boolean;
}

interface BuiltContextPack {
  contextBlock: string;
  selectedMemoryIds: Map<string, string>;
  selectedMemories: Array<{ memoryId: string; text: string; type: MemoryType; reason: string; score: number }>;
  ignoredMemories: Array<{ memoryId: string; reason: string }>;
  tokenBudget: number;
  estimatedTokens: number;
}

interface LinkedConflictMemories {
  candidate?: MemoryRecord;
  existing?: MemoryRecord;
}

interface AppliedResolutionMutation {
  before: MemoryRecord;
  expected: MemoryRecord;
  eventId?: string;
}

interface FeedbackTargetContext {
  memory?: MemoryRecord;
  trace?: MemoryTrace;
  run?: RunRecord;
  scope: MemoryScope;
  memoryType?: MemoryType;
  memoryStatus?: MemoryStatus;
  memoryImportance?: number;
}

export class MemoryConflictResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryConflictResolutionError";
  }
}

class ConflictLinkError extends MemoryConflictResolutionError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictLinkError";
  }
}

export class ContinuityMemoryService implements MemoryService {
  private readonly store: MemoryStore;
  private readonly provider: MemoryReasoningProvider;
  private readonly runtimeInfo: MemoryServiceRuntimeInfo;
  private readonly seedDemoMemories: boolean;
  private readonly conflictResolutionLocks = new Map<string, Promise<void>>();
  private readonly memoryMutationLocks = new Map<string, Promise<void>>();
  private seedPromise?: Promise<void>;

  constructor(options: ContinuityMemoryServiceOptions = {}) {
    this.store = options.store ?? new InMemoryMemoryStore();
    this.provider = options.provider ?? createDefaultReasoningProvider();
    this.runtimeInfo = {
      providerMode: providerModeFor(this.provider),
      storeMode: storeModeFor(this.store),
    };
    this.seedDemoMemories = options.seedDemoMemories ?? true;
  }

  getRuntimeInfo(): MemoryServiceRuntimeInfo {
    return this.runtimeInfo;
  }

  async continuityBootstrap(input: ContinuityBootstrapInput, context: MemoryServiceContext = {}): Promise<ContinuityBootstrapOutput> {
    await this.ensureSeeded();
    const scope = scopeFromBootstrap(input, context.caller);
    const recall = await this.store.recallMemories({
      scope,
      query: input.task_hint ?? "session bootstrap continuity context",
      types: ["identity", "user_preference", "procedure", "project_fact", "tool_memory", "failure_memory", "decision_memory"],
      limit: 12,
      actor: callerActor(context.caller, { type: "mcp_host", id: input.host }),
      metadata: { stage: "continuity_bootstrap" },
    });
    const pack = await this.buildContextPack({
      query: input.task_hint ?? "session bootstrap continuity context",
      scopes: toProviderScope(scope),
      memories: recall.memories.map(toStoredMemory),
      tokenBudget: input.token_budget ?? 1800,
    });
    const trace = await this.addContextPackTrace(recall.trace, pack);

    return {
      context_pack: groupContextPack(pack.selectedMemories.map((memory) => memory.text), recall.memories),
      memory_trace_id: trace.id,
      suggested_next_tools: ["memory_recall", "memory_reflect"],
    };
  }

  async recall(input: MemoryRecallInput, context: MemoryServiceContext = {}): Promise<MemoryRecallOutput> {
    await this.ensureSeeded();
    const scope = scopeFromTool(input.scopes, context.caller);
    const recall = await this.store.recallMemories({
      scope,
      query: input.query,
      types: input.types,
      limit: input.limit ?? 8,
      actor: callerActor(context.caller, { type: "mcp_host", id: scope.hostId }),
      metadata: { stage: "memory_recall" },
    });
    const pack = await this.buildContextPack({
      query: input.query,
      scopes: toProviderScope(scope),
      memories: recall.memories.map(toStoredMemory),
      tokenBudget: input.token_budget ?? 900,
    });
    const trace = await this.addContextPackTrace(recall.trace, pack);

    return {
      memories: recall.memories.map((memory) => toMemorySummary(memory, pack.selectedMemoryIds.get(memory.id))),
      context_block: pack.contextBlock,
      trace_id: trace.id,
    };
  }

  async remember(input: MemoryRememberInput, context: MemoryServiceContext = {}): Promise<MemoryRememberOutput> {
    await this.ensureSeeded();
    const sensitive = rejectSensitiveText(input.content);
    if (!sensitive.ok) {
      return {
        candidate_memories: [],
        warnings: sensitive.findings.map((finding) => `rejected_sensitive_${finding.type}:${finding.pattern}`),
      };
    }

    const scope = scopeFromTool(input.scopes, context.caller);
    const sourceKind = sourceKindFromRemember(input.source);
    const candidates = await this.provider.extractMemories({
      content: input.content,
      scopes: toProviderScope(scope),
      sourceKind,
      sourceTrust: sourceTrustForKind(sourceKind),
      approvalMode: input.approval_mode ?? "pending",
      now: new Date().toISOString(),
    });
    const stored: CandidateMemory[] = [];
    const warnings: string[] = [];

    for (const candidate of candidates) {
      if (candidate.status === "rejected" || candidate.safety.decision === "reject") {
        warnings.push(candidate.safety.reasons.join("; ") || "provider rejected memory candidate");
        stored.push(toCandidateMemory(candidate, "rejected"));
        continue;
      }

      const memoryInput = toCreateMemoryInput(candidate, scope, input.approval_mode ?? candidate.status);
      assertScopedRequestNarrowed(memoryInput.scope, context.caller, "memory_remember");
      const existing = await this.store.listMemories({ scope, types: [memoryInput.type] });
      const conflict = await this.provider.detectConflicts({
        candidate,
        existingMemories: existing.map(toStoredMemory),
        now: new Date().toISOString(),
      });

      if (conflict.recommendedAction === "reject") {
        warnings.push(conflict.reason || "conflict provider rejected candidate");
        stored.push(toCandidateMemory(candidate, "rejected"));
        continue;
      }

      const needsConflictReview = shouldHoldCandidateForConflictReview(conflict);
      const result = await this.store.addMemory(
        {
          ...memoryInput,
          status: needsConflictReview ? "pending" : memoryInput.status,
        },
        {
          actor: callerActor(context.caller, { type: "agent", id: "memory_remember" }),
          reason: conflict.reason || "Created from memory_remember.",
          metadata: {
            provider_conflicts: conflict.conflicts.length,
            provider_recommended_action: conflict.recommendedAction,
            source: input.source,
          },
        },
      );
      await persistConflictRecords(this.store, result.memory, conflict, input.source, context.caller);
      stored.push(toCandidateMemory(candidate, result.memory.status, result.memory.id));
    }

    return {
      candidate_memories: stored,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async reflect(input: MemoryReflectInput, context: MemoryServiceContext = {}): Promise<MemoryReflectOutput> {
    await this.ensureSeeded();
    const scope = scopeFromTool(input.scopes, context.caller);
    const run = await this.store.addRun({
      id: input.run_id,
      tenantId: scope.tenantId,
      userId: scope.userId,
      hostId: scope.hostId,
      agentProfileId: scope.agentProfileId,
      projectId: scope.projectId,
      summary: input.summary,
      outcome: input.outcome,
      metadata: {
        messages_count: input.messages?.length ?? 0,
        tool_calls_count: input.tool_calls?.length ?? 0,
      },
    });
    const reflection = await this.provider.reflectRun({
      runId: run.id,
      summary: input.summary,
      scopes: toProviderScope(scope),
      sourceTrust: "internal_run",
      messages: input.messages,
      toolCalls: input.tool_calls,
      outcome: input.outcome,
      now: new Date().toISOString(),
    });
    const newMemories: CandidateMemory[] = [];

    for (const candidate of reflection.newMemories) {
      if (candidate.status === "rejected" || candidate.safety.decision === "reject") {
        newMemories.push(toCandidateMemory(candidate, "rejected"));
        continue;
      }

      const memoryInput = toCreateMemoryInput(candidate, scope, "pending");
      assertScopedRequestNarrowed(memoryInput.scope, context.caller, "memory_reflect");
      const result = await this.store.addMemory(memoryInput, {
        actor: callerActor(context.caller, { type: "agent", id: "memory_reflect" }),
        reason: reflection.summary,
        runId: run.id,
      });
      newMemories.push(toCandidateMemory(candidate, result.memory.status, result.memory.id));
    }

    for (const invalidated of reflection.invalidatedMemories) {
      await this.withMemoryMutationLocks([invalidated.memoryId], async () => {
        const memory = await this.store.getMemory(invalidated.memoryId);
        if (memory) {
          assertScopedRequestNarrowed(memory.scope, context.caller, "memory_reflect invalidation");
          await this.store.updateMemory(
            invalidated.memoryId,
            { status: "invalidated", validUntil: new Date().toISOString() },
            {
              actor: callerActor(context.caller, { type: "agent", id: "memory_reflect" }),
              reason: invalidated.reason,
              runId: run.id,
            },
          );
        }
      });
    }

    const trace = await this.store.addTrace({
      tenantId: scope.tenantId,
      runId: run.id,
      query: input.summary,
      selectedMemoryIds: newMemories.map((memory) => memory.id).filter((id): id is string => Boolean(id)),
      contextPack: reflection.summary,
      metadata: { stage: "memory_reflect" },
    });

    return {
      new_memories: newMemories,
      invalidated_memories: reflection.invalidatedMemories.map((memory) => memory.memoryId),
      trace_id: trace.id,
    };
  }

  async update(input: MemoryUpdateInput, context: MemoryServiceContext = {}): Promise<MemoryUpdateOutput> {
    return await this.withMemoryMutationLocks([input.memory_id], async () => {
      await this.ensureSeeded();
      const current = await this.requireMutableMemory(input.memory_id, context.caller, "memory_update");
      assertMemoryExpectedStatus(current, input.expected_status);
      const result = await this.store.updateMemory(
        input.memory_id,
        {
          canonicalText: input.patch.text,
          status: input.patch.status,
          confidence: input.patch.confidence,
          importance: input.patch.importance,
          validFrom: input.patch.valid_from,
          validUntil: input.patch.valid_until,
          metadata: toJsonObject(input.patch.metadata),
        },
        {
          actor: callerActor(context.caller, { type: "user", id: "memory_update" }),
          reason: input.reason ?? "Updated through memory_update.",
          expectedStatus: input.expected_status,
        },
      );

      return {
        memory: {
          id: result.memory.id,
          text: result.memory.canonicalText,
          status: result.memory.status,
        },
        event_id: result.event.id,
        warnings: input.supersede_conflicting
          ? ["supersede_conflicting is accepted but conflict merge is not automatic in the MVP"]
          : undefined,
      };
    });
  }

  async resolveConflict(
    input: MemoryResolveConflictInput,
    context: MemoryServiceContext = {},
  ): Promise<MemoryResolveConflictOutput> {
    const request = MemoryResolveConflictInputSchema.parse(input);
    return await this.withConflictResolutionLock(request.conflict_id, async () => {
      return await this.resolveConflictLocked(request, context);
    });
  }

  private async resolveConflictLocked(
    request: MemoryResolveConflictInput,
    context: MemoryServiceContext,
  ): Promise<MemoryResolveConflictOutput> {
    await this.ensureSeeded();
    const initialConflict = await this.store.getConflict(request.conflict_id);
    if (!initialConflict) {
      throw new Error(`Memory conflict not found: ${request.conflict_id}`);
    }
    const linkedMemoryIds = [initialConflict.candidateMemoryId, initialConflict.existingMemoryId].filter(
      (memoryId): memoryId is string => Boolean(memoryId),
    );
    return await this.withMemoryMutationLocks(linkedMemoryIds, async () => {
      return await this.resolveConflictWithMemoryLocks(request, context);
    });
  }

  private async resolveConflictWithMemoryLocks(
    request: MemoryResolveConflictInput,
    context: MemoryServiceContext,
  ): Promise<MemoryResolveConflictOutput> {
    const conflict = await this.store.getConflict(request.conflict_id);
    if (!conflict) {
      throw new Error(`Memory conflict not found: ${request.conflict_id}`);
    }
    const linked = await this.loadAuthorizedConflictMemories(
      conflict,
      context.caller,
      "memory_resolve_conflict",
    );
    if (conflict.status !== "open") {
      return terminalResolutionRetryOutput(conflict, request, linked);
    }
    await this.assertNoUnreconciledResolutionAttempt(conflict);
    assertResolutionActionRequirements(request.action, linked);

    const attemptId = randomUUID();
    const actor = callerActor(context.caller, { type: "user", id: "memory_resolve_conflict" });
    const mutationOptions = {
      actor,
      reason: request.reason,
      metadata: toJsonObject({
        conflict_id: conflict.id,
        resolution_action: request.action,
        resolution_attempt_id: attemptId,
      }),
    };
    const applied: AppliedResolutionMutation[] = [];

    try {
      await this.applyConflictResolutionAction(request, linked, mutationOptions, applied);
      const changed = await this.reloadLinkedConflictMemories(conflict);
      assertResolutionMemoryPostconditions(request, linked, changed);
    } catch (error) {
      await this.rollbackResolutionMutations(conflict, request.action, attemptId, actor, applied, error);
      throw error;
    }

    const eventIds = applied
      .map((mutation) => mutation.eventId)
      .filter((eventId): eventId is string => Boolean(eventId));
    const conflictStatus = request.action === "dismiss_conflict" ? "dismissed" : "resolved";
    const resolution = toJsonObject({
      action: request.action,
      attempt_id: attemptId,
      reason: request.reason,
      merged_text: request.merged_text,
      actor_type: actor.type,
      actor_id: actor.id,
      event_ids: eventIds,
    }) ?? { action: request.action };

    try {
      await this.store.resolveConflict(conflict.id, resolution as { action: string } & JsonObject, {
        status: conflictStatus,
        actor,
        reason: request.reason,
        metadata: toJsonObject({
          resolution_action: request.action,
          resolution_attempt_id: attemptId,
          resolution_actor_type: actor.type,
          resolution_actor_id: actor.id,
          resolution_event_ids: eventIds,
        }),
      });
    } catch (error) {
      const persisted = await this.store.getConflict(conflict.id);
      if (isExpectedConflictResolution(persisted, request.action, conflictStatus, attemptId, eventIds)) {
        const finalLinked = await this.reloadLinkedConflictMemories(conflict);
        assertResolutionMemoryPostconditions(request, linked, finalLinked);
        return resolutionOutput(persisted, request.action, finalLinked);
      }

      if (persisted?.status === "open") {
        await this.rollbackResolutionMutations(conflict, request.action, attemptId, actor, applied, error);
      }
      throw error;
    }

    const persisted = await this.store.getConflict(conflict.id);
    if (!isExpectedConflictResolution(persisted, request.action, conflictStatus, attemptId, eventIds)) {
      if (persisted?.status === "open") {
        await this.rollbackResolutionMutations(
          conflict,
          request.action,
          attemptId,
          actor,
          applied,
          new Error(`Memory conflict ${conflict.id} did not persist its resolution.`),
        );
      }
      throw new Error(`Memory conflict ${conflict.id} did not persist a consistent resolution.`);
    }

    const finalLinked = await this.reloadLinkedConflictMemories(conflict);
    assertResolutionMemoryPostconditions(request, linked, finalLinked);
    return resolutionOutput(persisted, request.action, finalLinked);
  }

  private async withConflictResolutionLock<T>(conflictId: string, operation: () => Promise<T>): Promise<T> {
    return await this.withKeyedLock(this.conflictResolutionLocks, conflictId, operation);
  }

  private async withMemoryMutationLocks<T>(memoryIds: string[], operation: () => Promise<T>): Promise<T> {
    const orderedIds = [...new Set(memoryIds)].sort();
    const acquire = async (index: number): Promise<T> => {
      const memoryId = orderedIds[index];
      if (!memoryId) {
        return await operation();
      }
      return await this.withKeyedLock(this.memoryMutationLocks, memoryId, async () => {
        return await acquire(index + 1);
      });
    };
    return await acquire(0);
  }

  private async withKeyedLock<T>(
    locks: Map<string, Promise<void>>,
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    locks.set(key, tail);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (locks.get(key) === tail) {
        locks.delete(key);
      }
    }
  }

  async feedback(input: MemoryFeedbackInput, context: MemoryServiceContext = {}): Promise<MemoryFeedbackOutput> {
    const request = MemoryFeedbackInputSchema.parse(input);
    const lockIds = request.memory_id ? [request.memory_id] : [];
    return await this.withMemoryMutationLocks(lockIds, async () => {
      await this.ensureSeeded();
      const target = await this.resolveFeedbackTarget(request, context.caller);
      const actor = callerActor(context.caller, { type: "user", id: "memory_feedback" });
      const reason = request.reason ? publicSafeFeedbackText(request.reason, "failure_memory") : undefined;
      const correctionText = request.correction?.trim();
      const correctionSafety = correctionText
        ? assessMemorySafety({
            text: correctionText,
            type: target.memoryType ?? "failure_memory",
            sourceTrust: "user_direct",
          })
        : undefined;
      if (correctionText && correctionSafety?.decision === "reject") {
        assertNoSensitiveText(correctionText);
        throw new Error("memory_feedback correction contains sensitive credential content.");
      }
      const safeCorrectionText = correctionSafety?.redactedText.trim();

      const fixture = buildFeedbackRegressionFixture(request, target, reason, safeCorrectionText);
      const correctionInput: CreateMemoryInput | undefined = safeCorrectionText
        ? {
            scope: target.scope,
            type: target.memoryType ?? "failure_memory",
            canonicalText: safeCorrectionText,
            sourceKind: "user_correction",
            status: "pending",
            confidence: 1,
            importance: Math.max(target.memoryImportance ?? 0.7, 0.7),
            metadata: feedbackCorrectionMetadata(request),
          }
        : undefined;
      const correctionOptions = {
        actor,
        reason: "Created from unhelpful memory feedback correction.",
        runId: target.run?.id ?? request.run_id,
      };
      const feedbackInput = {
        scope: target.scope,
        memoryId: request.memory_id,
        traceId: request.trace_id,
        runId: target.run?.id ?? request.run_id ?? target.trace?.runId,
        signal: request.signal,
        reason,
        regressionFixture: fixture,
        metadata: {
          target: fixture.target,
          has_correction: correctionInput !== undefined,
        },
      };
      const feedbackOptions = {
        actor,
        reason,
        runId: target.run?.id ?? request.run_id ?? target.trace?.runId,
      };
      let feedback: MemoryFeedbackRecord;
      let correction: MemoryWriteResult | undefined;
      const atomicAdd = this.store.addFeedbackWithCorrection?.bind(this.store);
      if (correctionInput && atomicAdd) {
        const result = await atomicAdd(feedbackInput, correctionInput, {
          feedback: feedbackOptions,
          correction: correctionOptions,
        });
        feedback = result.feedback;
        correction = result.correction;
      } else {
        correction = correctionInput
          ? await this.store.addMemory(correctionInput, correctionOptions)
          : undefined;
        try {
          feedback = await this.store.addFeedback(
            { ...feedbackInput, correctionMemoryId: correction?.memory.id },
            feedbackOptions,
          );
        } catch (error) {
          if (correction) {
            try {
              await this.store.deleteMemory(correction.memory.id, {
                actor: { type: "system", id: "memory_feedback_rollback" },
                reason: "Rolled back an uncommitted feedback correction.",
              });
            } catch {
              throw new Error("memory_feedback failed and correction rollback was incomplete.", {
                cause: error,
              });
            }
          }
          throw error;
        }
      }

      return feedbackOutput(feedback, correction?.memory, fixture);
    });
  }

  async forget(input: MemoryForgetInput, context: MemoryServiceContext = {}): Promise<MemoryForgetOutput> {
    return await this.withMemoryMutationLocks([input.memory_id], async () => {
      await this.ensureSeeded();
      await this.requireMutableMemory(input.memory_id, context.caller, "memory_forget");
      const statusByMode: Record<MemoryForgetInput["mode"], MemoryStatus> = {
        archive: "archived",
        expire: "expired",
        hard_delete: "deleted",
        invalidate: "invalidated",
      };
      const status = statusByMode[input.mode];
      if (input.mode === "hard_delete") {
        const result = await this.store.deleteMemory(input.memory_id, {
              actor: callerActor(context.caller, { type: "user", id: "memory_forget" }),
              reason: input.reason,
            });
        return {
          memory_id: result.deletedMemoryId,
          mode: input.mode,
          status: "deleted",
          event_id: result.event.id,
        };
      }

      const result = await this.store.updateMemory(
              input.memory_id,
              {
                status,
                validUntil: status === "expired" || status === "invalidated" ? new Date().toISOString() : undefined,
              },
              {
                actor: callerActor(context.caller, { type: "user", id: "memory_forget" }),
                reason: input.reason,
              },
            );

      return {
        memory_id: result.memory.id,
        mode: input.mode,
        status: result.memory.status,
        event_id: result.event.id,
      };
    });
  }

  async trace(input: MemoryTraceInput, context: MemoryServiceContext = {}): Promise<MemoryTraceOutput> {
    await this.ensureSeeded();
    const trace = await this.store.getTrace(input.trace_id);
    if (!trace) {
      return {
        used_memories: [],
        ignored_memories: [],
        excluded_memories: [{ memory_id: input.trace_id, reason: "Trace not found." }],
      };
    }
    await this.assertTraceReadable(trace, context.caller, "memory_trace");

    const selected = await this.memoriesById(trace.selectedMemoryIds);
    const ignored = await this.memoriesById(trace.ignoredMemoryIds);
    const explanation = await this.provider.explainMemoryUsage({
      traceId: trace.id,
      query: trace.query,
      usedMemories: selected.map((memory) => ({
        memoryId: memory.id,
        type: memory.type,
        text: memory.canonicalText,
        reason: trace.selectionReasons[memory.id] ?? "Selected for context.",
        score: memory.importance,
      })),
      ignoredMemories: ignored.map((memory) => ({
        memoryId: memory.id,
        reason: trace.selectionReasons[memory.id] ?? "Ignored by lifecycle or validity filtering.",
      })),
    });

    return {
      used_memories: explanation.usedMemories.map((memory) => ({
        memory_id: memory.memoryId,
        reason: memory.reason,
      })),
      ignored_memories: explanation.ignoredMemories.map((memory) => ({
        memory_id: memory.memoryId,
        reason: memory.reason,
      })),
      excluded_memories: explanation.excludedMemories.map((memory) => ({
        memory_id: memory.memoryId,
        reason: memory.reason,
      })),
    };
  }

  async readResource(input: MemoryResourceRequest, context: MemoryServiceContext = {}): Promise<MemoryResourceResult> {
    await this.ensureSeeded();
    const payload = await this.resourcePayload(input, context.caller);
    return {
      uri: input.uri,
      mimeType: "application/json",
      text: JSON.stringify(payload, null, 2),
    };
  }

  private async resourcePayload(input: MemoryResourceRequest, caller: CallerContext | undefined): Promise<unknown> {
    if (input.name === "memory-trace") {
      const trace = await this.store.getTrace(input.variables.trace_id);
      if (trace) {
        await this.assertTraceReadable(trace, caller, "memory-trace resource");
      }
      return trace ?? { uri: input.uri, status: "not_found" };
    }

    if (input.name === "run-summary") {
      const run = await this.store.getRun(input.variables.run_id);
      if (run) {
        assertScopedRequestNarrowed(scopeFromRun(run), caller, "run-summary resource");
      }
      return run ?? { uri: input.uri, status: "not_found" };
    }

    if (input.name === "vault-conflicts") {
      return await this.conflictResourcePayload(input, caller);
    }

    const filter = resourceFilter(input, caller);
    const memories = await this.store.listMemories(filter);
    return {
      uri: input.uri,
      count: memories.length,
      memories: memories.map((memory) => toMemorySummary(memory)),
    };
  }

  private async conflictResourcePayload(
    input: MemoryResourceRequest,
    caller: CallerContext | undefined,
  ): Promise<unknown> {
    const tenantConflicts = await this.store.listConflicts({
      tenantId: isAuthEnforced(caller) ? caller.tenantId : undefined,
      statuses: ["open"],
    });

    const conflicts: MemoryConflictRecord[] = [];
    const memoryById = new Map<string, MemoryRecord>();
    for (const conflict of tenantConflicts) {
      try {
        const linked = await this.loadAuthorizedConflictMemories(conflict, caller, "vault-conflicts resource");
        conflicts.push(conflict);
        if (linked.candidate) {
          memoryById.set(linked.candidate.id, linked.candidate);
        }
        if (linked.existing) {
          memoryById.set(linked.existing.id, linked.existing);
        }
      } catch (error) {
        if (error instanceof ScopeGuardError || error instanceof ConflictLinkError) {
          continue;
        }
        throw error;
      }
    }

    return {
      uri: input.uri,
      count: conflicts.length,
      conflicts: conflicts.map((conflict) => toConflictResourceItem(conflict, memoryById)),
    };
  }

  private async assertNoUnreconciledResolutionAttempt(conflict: MemoryConflictRecord): Promise<void> {
    const linkedMemoryIds = new Set(
      [conflict.candidateMemoryId, conflict.existingMemoryId].filter(
        (memoryId): memoryId is string => Boolean(memoryId),
      ),
    );
    const mutations = new Set<string>();
    const rollbacks = new Set<string>();
    const eventLists = await Promise.all(
      [...linkedMemoryIds].map((memoryId) =>
        this.store.listEvents({ tenantId: conflict.tenantId, memoryId }),
      ),
    );
    for (const event of eventLists.flat()) {
      if (!event.memoryId || event.metadata.conflict_id !== conflict.id) {
        continue;
      }
      const attemptId = event.metadata.resolution_attempt_id;
      if (typeof attemptId !== "string" || attemptId.length === 0) {
        continue;
      }
      const key = `${attemptId}:${event.memoryId}`;
      if (event.metadata.resolution_rollback === true) {
        rollbacks.add(key);
      } else {
        mutations.add(key);
      }
    }

    const unreconciled = [...mutations].filter((key) => !rollbacks.has(key));
    if (unreconciled.length > 0) {
      throw new Error(
        `Memory conflict ${conflict.id} has an unreconciled prior resolution attempt; repair or roll it back before choosing another action.`,
      );
    }
  }

  private async loadAuthorizedConflictMemories(
    conflict: MemoryConflictRecord,
    caller: CallerContext | undefined,
    operation: string,
  ): Promise<LinkedConflictMemories> {
    if (isAuthEnforced(caller) && conflict.tenantId !== caller.tenantId) {
      throw new ScopeGuardError(`${operation} is not authorized for tenant ${conflict.tenantId}.`);
    }

    const linked = await this.reloadLinkedConflictMemories(conflict);
    const memories = [linked.candidate, linked.existing].filter((memory): memory is MemoryRecord => Boolean(memory));
    if (isAuthEnforced(caller) && memories.length === 0) {
      throw new ScopeGuardError(`${operation} cannot verify caller user scope for conflict ${conflict.id}.`);
    }

    for (const memory of memories) {
      if (memory.scope.tenantId !== conflict.tenantId) {
        throw new ConflictLinkError(`Memory conflict ${conflict.id} has a tenant-inconsistent memory link.`);
      }
      assertScopedRequestNarrowed(memory.scope, caller, operation);
    }

    if (linked.candidate && linked.existing && linked.candidate.scope.userId !== linked.existing.scope.userId) {
      throw new ConflictLinkError(`Memory conflict ${conflict.id} links memories from different users.`);
    }
    return linked;
  }

  private async reloadLinkedConflictMemories(conflict: MemoryConflictRecord): Promise<LinkedConflictMemories> {
    const candidate = conflict.candidateMemoryId
      ? await this.store.getMemory(conflict.candidateMemoryId)
      : undefined;
    const existing = conflict.existingMemoryId
      ? await this.store.getMemory(conflict.existingMemoryId)
      : undefined;

    if (conflict.candidateMemoryId && !candidate) {
      throw new ConflictLinkError(`Memory conflict ${conflict.id} references a missing candidate memory.`);
    }
    if (conflict.existingMemoryId && !existing) {
      throw new ConflictLinkError(`Memory conflict ${conflict.id} references a missing existing memory.`);
    }
    return { candidate, existing };
  }

  private async applyConflictResolutionAction(
    input: MemoryResolveConflictInput,
    linked: LinkedConflictMemories,
    options: { actor: MemoryActor; reason: string; metadata?: JsonObject },
    applied: AppliedResolutionMutation[],
  ): Promise<void> {
    if (input.action === "dismiss_conflict") {
      return;
    }

    const candidate = linked.candidate as MemoryRecord;
    if (input.action === "accept_candidate" || input.action === "keep_both") {
      await this.updateResolutionMemory(candidate, { status: "active" }, options, applied);
      return;
    }
    if (input.action === "reject_candidate") {
      await this.updateResolutionMemory(candidate, { status: "rejected" }, options, applied);
      return;
    }

    const existing = linked.existing as MemoryRecord;
    const candidatePatch: UpdateMemoryPatch = {
      status: "active",
      supersedes: [...new Set([...candidate.supersedes, existing.id])],
    };
    if (input.action === "merge") {
      candidatePatch.canonicalText = input.merged_text;
    }
    await this.updateResolutionMemory(candidate, candidatePatch, options, applied);
    await this.updateResolutionMemory(
      existing,
      { status: "superseded", supersededBy: candidate.id },
      options,
      applied,
    );
  }

  private async updateResolutionMemory(
    expectedBefore: MemoryRecord,
    patch: UpdateMemoryPatch,
    options: { actor: MemoryActor; reason: string; metadata?: JsonObject },
    applied: AppliedResolutionMutation[],
  ): Promise<MemoryUpdateResult> {
    const observedBefore = await this.store.getMemory(expectedBefore.id);
    if (!observedBefore) {
      throw new ConflictLinkError(`Memory conflict resolution references missing memory ${expectedBefore.id}.`);
    }
    requireResolution(
      matchesResolutionSnapshot(observedBefore, expectedBefore),
      `Memory ${expectedBefore.id} changed after conflict authorization; retry the resolution against current state.`,
    );
    const mutation: AppliedResolutionMutation = {
      before: observedBefore,
      expected: applyMemoryPatch(observedBefore, patch),
    };
    applied.push(mutation);

    const result = await this.store.updateMemory(expectedBefore.id, patch, options);
    mutation.before = result.before;
    mutation.expected = applyMemoryPatch(result.before, patch);
    mutation.eventId = result.event.id;
    return result;
  }

  private async rollbackResolutionMutations(
    conflict: MemoryConflictRecord,
    action: MemoryConflictResolutionAction,
    attemptId: string,
    actor: MemoryActor,
    applied: AppliedResolutionMutation[],
    originalError: unknown,
  ): Promise<void> {
    const rollbackErrors: unknown[] = [];
    for (const mutation of [...applied].reverse()) {
      try {
        const current = await this.store.getMemory(mutation.before.id);
        if (
          !current ||
          (!matchesResolutionSnapshot(current, mutation.before) &&
            !matchesResolutionSnapshot(current, mutation.expected))
        ) {
          rollbackErrors.push(
            new Error(`Memory ${mutation.before.id} changed outside the failed resolution attempt.`),
          );
          continue;
        }
        await this.store.updateMemory(mutation.before.id, restorationPatch(mutation.before), {
          actor,
          reason: `Rollback incomplete ${action} resolution for conflict ${conflict.id}.`,
          metadata: {
            conflict_id: conflict.id,
            resolution_action: action,
            resolution_attempt_id: attemptId,
            resolution_rollback: true,
          },
        });
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    for (const snapshot of uniqueMutationSnapshots(applied)) {
      try {
        const restored = await this.store.getMemory(snapshot.id);
        if (!restored || !matchesResolutionSnapshot(restored, snapshot)) {
          rollbackErrors.push(new Error(`Memory ${snapshot.id} was not restored after resolution failure.`));
        }
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new Error(`Conflict ${conflict.id} resolution failed and memory rollback was incomplete.`, {
        cause: originalError,
      });
    }
  }

  private async memoriesById(ids: string[]): Promise<MemoryRecord[]> {
    const memories = await Promise.all(ids.map((id) => this.store.getMemory(id)));
    return memories.filter((memory): memory is MemoryRecord => Boolean(memory));
  }

  private async resolveFeedbackTarget(
    request: MemoryFeedbackInput,
    caller: CallerContext | undefined,
  ): Promise<FeedbackTargetContext> {
    const memory = request.memory_id
      ? await this.requireMutableMemory(request.memory_id, caller, "memory_feedback")
      : undefined;
    const trace = request.trace_id ? await this.store.getTrace(request.trace_id) : undefined;
    if (request.trace_id && !trace) {
      throw new Error(`Memory trace not found: ${request.trace_id}`);
    }
    if (trace) {
      await this.assertTraceReadable(trace, caller, "memory_feedback");
    }
    if (memory && trace && !traceReferencesMemory(trace, memory.id)) {
      throw new ScopeGuardError(
        `memory_feedback trace ${trace.id} does not reference memory ${memory.id}.`,
      );
    }
    if (memory && trace && memory.scope.tenantId !== trace.tenantId) {
      throw new ScopeGuardError("memory_feedback targets must share a tenant scope.");
    }
    if (request.run_id && trace?.runId && request.run_id !== trace.runId) {
      throw new ScopeGuardError("memory_feedback run_id does not match the target trace run.");
    }

    const runId = request.run_id ?? trace?.runId;
    const run = runId ? await this.store.getRun(runId) : undefined;
    if (request.run_id && !run) {
      throw new Error(`Run not found: ${request.run_id}`);
    }
    if (run) {
      assertScopedRequestNarrowed(scopeFromRun(run), caller, "memory_feedback");
      if (trace && trace.tenantId !== run.tenantId) {
        throw new ScopeGuardError("memory_feedback trace and run must share the same tenant scope.");
      }
    }

    let inheritedMemory: MemoryRecord | undefined;
    if (!memory && trace) {
      const selectedIds = [...new Set(trace.selectedMemoryIds)];
      if (selectedIds.length === 1) {
        inheritedMemory = await this.store.getMemory(selectedIds[0]);
        if (inheritedMemory) {
          if (run) {
            if (
              inheritedMemory.scope.tenantId !== run.tenantId
              || inheritedMemory.scope.userId !== run.userId
            ) {
              throw new ScopeGuardError(
                "memory_feedback trace memory and run must share tenant and user scope.",
              );
            }
            assertScopeAllowed(inheritedMemory.scope, caller, "memory_feedback correction type hint");
          } else {
            assertScopedRequestNarrowed(inheritedMemory.scope, caller, "memory_feedback correction");
          }
        }
      }
    }

    if (run) {
      const runScope = scopeFromRun(run);
      if (memory) assertFeedbackScopesCompatible(memory.scope, runScope, "memory target", "run");
    }

    const scope = memory?.scope
      ?? (run ? scopeFromRun(run) : inheritedMemory?.scope ?? (trace ? feedbackScopeFromTrace(trace, caller) : undefined));
    if (!scope) {
      throw new ScopeGuardError("memory_feedback could not resolve an authorized target scope.");
    }
    assertScopedRequestNarrowed(scope, caller, "memory_feedback");

    return {
      memory,
      trace,
      run,
      scope,
      memoryType: memory?.type ?? inheritedMemory?.type ?? "failure_memory",
      memoryStatus: memory?.status ?? inheritedMemory?.status,
      memoryImportance: memory?.importance ?? inheritedMemory?.importance,
    };
  }

  private async buildContextPack(input: ContextPackInput): Promise<BuiltContextPack> {
    const pack = await this.provider.buildContextPack(input);
    return {
      contextBlock: pack.contextBlock,
      selectedMemoryIds: new Map(pack.selectedMemories.map((memory) => [memory.memoryId, memory.reason])),
      selectedMemories: pack.selectedMemories,
      ignoredMemories: pack.ignoredMemories,
      tokenBudget: pack.tokenBudget,
      estimatedTokens: pack.estimatedTokens,
    };
  }

  private async addContextPackTrace(retrievalTrace: MemoryTrace, pack: BuiltContextPack): Promise<MemoryTrace> {
    const selectionReasons = Object.fromEntries([
      ...pack.selectedMemories.map((memory) => [memory.memoryId, memory.reason] as const),
      ...pack.ignoredMemories.map((memory) => [memory.memoryId, memory.reason] as const),
    ]);

    return await this.store.addTrace({
      tenantId: retrievalTrace.tenantId,
      runId: retrievalTrace.runId,
      query: retrievalTrace.query,
      selectedMemoryIds: pack.selectedMemories.map((memory) => memory.memoryId),
      ignoredMemoryIds: pack.ignoredMemories.map((memory) => memory.memoryId),
      contextPack: pack.contextBlock,
      selectionReasons,
      metadata: {
        ...retrievalTrace.metadata,
        stage: "context_pack",
        retrieval_trace_id: retrievalTrace.id,
        token_budget: pack.tokenBudget,
        estimated_tokens: pack.estimatedTokens,
      },
    });
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seedDemoMemories) {
      return;
    }
    if (!this.seedPromise) {
      this.seedPromise = seedDemoMemories(this.store);
    }
    await this.seedPromise;
  }

  private async requireMutableMemory(
    memoryId: string,
    caller: CallerContext | undefined,
    operation: string,
  ): Promise<MemoryRecord> {
    const memory = await this.store.getMemory(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    assertScopedRequestNarrowed(memory.scope, caller, operation);
    return memory;
  }

  private async assertTraceReadable(
    trace: MemoryTrace,
    caller: CallerContext | undefined,
    operation: string,
  ): Promise<void> {
    if (!isAuthEnforced(caller)) {
      return;
    }
    if (trace.tenantId !== caller.tenantId) {
      throw new ScopeGuardError(`${operation} is not authorized for tenant ${trace.tenantId}.`);
    }

    if (trace.runId) {
      const run = await this.store.getRun(trace.runId);
      if (run) {
        assertScopedRequestNarrowed(scopeFromRun(run), caller, operation);
        return;
      }
    }

    const memoryIds = [...trace.selectedMemoryIds, ...trace.ignoredMemoryIds];
    if (memoryIds.length === 0) {
      throw new ScopeGuardError(`${operation} cannot verify caller user scope for trace ${trace.id}.`);
    }

    let verified = 0;
    for (const memory of await this.memoriesById(memoryIds)) {
      assertScopedRequestNarrowed(memory.scope, caller, operation);
      verified += 1;
    }
    if (verified === 0) {
      throw new ScopeGuardError(`${operation} cannot verify caller user scope for trace ${trace.id}.`);
    }
  }
}

function traceReferencesMemory(trace: MemoryTrace, memoryId: string): boolean {
  if (trace.selectedMemoryIds.includes(memoryId) || trace.ignoredMemoryIds.includes(memoryId)) {
    return true;
  }
  const excluded = trace.metadata.excludedMemoryIds ?? trace.metadata.excluded_memory_ids;
  return Array.isArray(excluded) && excluded.includes(memoryId);
}

function feedbackScopeFromTrace(trace: MemoryTrace, caller: CallerContext | undefined): MemoryScope {
  const scope = applyCallerAllowedDefaults(
    {
      tenantId: trace.tenantId,
      userId: caller?.userId ?? DEFAULT_USER_ID,
      agentProfileId: jsonString(trace.metadata.agentProfileId ?? trace.metadata.agent_profile_id),
      projectId: jsonString(trace.metadata.projectId ?? trace.metadata.project_id),
      hostId: jsonString(trace.metadata.hostId ?? trace.metadata.host_id),
      sessionId: jsonString(trace.metadata.sessionId ?? trace.metadata.session_id),
      toolId: jsonString(trace.metadata.toolId ?? trace.metadata.tool_id),
    },
    caller,
  );
  assertScopedRequestNarrowed(scope, caller, "memory_feedback trace scope");
  return scope;
}

function feedbackCorrectionMetadata(input: MemoryFeedbackInput): JsonObject {
  const metadata: JsonObject = {
    feedback_signal: input.signal,
    approval_mode: "pending",
  };
  if (input.memory_id) metadata.feedback_memory_id = input.memory_id;
  if (input.trace_id) metadata.feedback_trace_id = input.trace_id;
  if (input.run_id) metadata.feedback_run_id = input.run_id;
  return metadata;
}

function buildFeedbackRegressionFixture(
  input: MemoryFeedbackInput,
  target: FeedbackTargetContext,
  reason: string | undefined,
  correction: string | undefined,
): MemoryFeedbackRegressionFixture {
  const fixture: MemoryFeedbackRegressionFixture = {
    schema_version: "1",
    target: input.memory_id && input.trace_id ? "memory_and_trace" : input.memory_id ? "memory" : "trace",
    signal: input.signal,
    memory_type: target.memoryType,
    memory_status: target.memoryStatus,
    scope_dimensions: feedbackScopeDimensions(target.scope),
  };
  const traceQuery = fixtureText(target.trace?.query);
  const runTaskHint = fixtureText(target.run?.taskHint);
  const safeReason = fixtureText(reason);
  const safeCorrection = fixtureText(correction);
  if (traceQuery) fixture.trace_query = traceQuery;
  if (runTaskHint) fixture.run_task_hint = runTaskHint;
  if (safeReason) fixture.reason = safeReason;
  if (safeCorrection) fixture.correction = safeCorrection;
  return fixture;
}

function feedbackScopeDimensions(scope: MemoryScope): string[] {
  return [
    ["tenant", scope.tenantId],
    ["user", scope.userId],
    ["agent_profile", scope.agentProfileId],
    ["project", scope.projectId],
    ["host", scope.hostId],
    ["session", scope.sessionId],
    ["tool", scope.toolId],
  ].filter((entry) => entry[1] !== undefined).map((entry) => entry[0] as string);
}

function fixtureText(value: string | undefined): string | undefined {
  const text = value ? publicSafeFeedbackText(value, "failure_memory").trim().slice(0, 1000) : "";
  return text || undefined;
}

function publicSafeFeedbackText(value: string, type: MemoryType): string {
  return assessMemorySafety({
    text: redactSensitiveText(value),
    type,
    sourceTrust: "user_direct",
  }).redactedText;
}

function assertFeedbackScopesCompatible(
  left: MemoryScope,
  right: MemoryScope,
  leftLabel: string,
  rightLabel: string,
): void {
  if (left.tenantId !== right.tenantId || left.userId !== right.userId) {
    throw new ScopeGuardError(`memory_feedback ${leftLabel} and ${rightLabel} must share tenant and user scope.`);
  }
  for (const dimension of [
    "agentProfileId",
    "projectId",
    "hostId",
    "sessionId",
    "toolId",
  ] as const) {
    const leftValue = left[dimension];
    const rightValue = right[dimension];
    if (leftValue !== rightValue) {
      throw new ScopeGuardError(
        `memory_feedback ${leftLabel} and ${rightLabel} have conflicting ${dimension} scope.`,
      );
    }
  }
}

function feedbackOutput(
  feedback: MemoryFeedbackRecord,
  correction: MemoryRecord | undefined,
  fixture: MemoryFeedbackRegressionFixture,
): MemoryFeedbackOutput {
  const output: MemoryFeedbackOutput = {
    feedback_id: feedback.id,
    signal: feedback.signal,
    created_at: feedback.createdAt.toISOString(),
    regression_fixture: fixture,
  };
  if (feedback.memoryId) output.memory_id = feedback.memoryId;
  if (feedback.traceId) output.trace_id = feedback.traceId;
  if (correction) {
    output.correction_memory = {
      id: correction.id,
      text: correction.canonicalText,
      type: correction.type,
      status: "pending",
    };
  }
  return output;
}

function jsonString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function assertResolutionActionRequirements(
  action: MemoryConflictResolutionAction,
  linked: LinkedConflictMemories,
): void {
  if (action === "dismiss_conflict") {
    requireResolution(
      Boolean(linked.candidate || linked.existing),
      "dismiss_conflict requires at least one linked memory.",
    );
    return;
  }

  const candidate = linked.candidate;
  requireResolution(candidate, `${action} requires a candidate memory.`);
  const allowedCandidateStatuses = action === "reject_candidate" ? ["pending", "rejected"] : ["pending", "active"];
  requireResolution(
    allowedCandidateStatuses.includes(candidate.status),
    `${action} cannot be applied to candidate memory status ${candidate.status}.`,
  );
  if (action !== "reject_candidate") {
    requireResolution(
      candidate.supersededBy === undefined,
      `${action} cannot activate a candidate that is already superseded.`,
    );
  }

  if (action === "accept_candidate" || action === "reject_candidate") {
    return;
  }

  const existing = linked.existing;
  requireResolution(existing, `${action} requires an existing memory.`);
  requireResolution(candidate.id !== existing.id, `${action} requires two distinct memories.`);

  if (action === "keep_both") {
    requireResolution(existing.status === "active", "keep_both requires the existing memory to remain active.");
    requireResolution(existing.supersededBy === undefined, "keep_both cannot revive a superseded existing memory.");
    return;
  }

  const existingIsActive = existing.status === "active" && existing.supersededBy === undefined;
  const existingIsPartiallyApplied = existing.status === "superseded" && existing.supersededBy === candidate.id;
  requireResolution(
    existingIsActive || existingIsPartiallyApplied,
    `${action} cannot replace an existing memory already superseded by another memory.`,
  );
}

function assertResolutionMemoryPostconditions(
  input: MemoryResolveConflictInput,
  before: LinkedConflictMemories,
  after: LinkedConflictMemories,
): void {
  assertLinkedMemoryProvenancePreserved(before.candidate, after.candidate, "candidate");
  assertLinkedMemoryProvenancePreserved(before.existing, after.existing, "existing");

  if (input.action === "dismiss_conflict") {
    assertLinkedMemoryUnchanged(before.candidate, after.candidate, "candidate");
    assertLinkedMemoryUnchanged(before.existing, after.existing, "existing");
    return;
  }

  const candidateBefore = before.candidate as MemoryRecord;
  const candidateAfter = after.candidate as MemoryRecord;
  if (input.action === "reject_candidate") {
    requireResolution(candidateAfter.status === "rejected", "Rejected candidate did not persist rejected status.");
    assertMemoryFieldsUnchanged(candidateBefore, candidateAfter, ["status"]);
    assertLinkedMemoryUnchanged(before.existing, after.existing, "existing");
    return;
  }

  requireResolution(candidateAfter.status === "active", "Accepted candidate did not persist active status.");
  if (input.action === "accept_candidate" || input.action === "keep_both") {
    assertMemoryFieldsUnchanged(candidateBefore, candidateAfter, ["status"]);
    assertLinkedMemoryUnchanged(before.existing, after.existing, "existing");
    if (input.action === "keep_both") {
      requireResolution(after.existing?.status === "active", "keep_both did not preserve the existing memory as active.");
    }
    return;
  }

  const existingBefore = before.existing as MemoryRecord;
  const existingAfter = after.existing as MemoryRecord;
  requireResolution(
    candidateAfter.supersedes.includes(existingAfter.id),
    `${input.action} did not link the candidate to the superseded memory.`,
  );
  requireResolution(existingAfter.status === "superseded", `${input.action} did not supersede the existing memory.`);
  requireResolution(
    existingAfter.supersededBy === candidateAfter.id,
    `${input.action} did not link the existing memory to its replacement.`,
  );
  if (input.action === "merge") {
    requireResolution(
      candidateAfter.canonicalText === input.merged_text?.trim(),
      "merge did not persist merged_text as the candidate canonical text.",
    );
    assertMemoryFieldsUnchanged(candidateBefore, candidateAfter, ["canonicalText", "status", "supersedes"]);
  } else {
    assertMemoryFieldsUnchanged(candidateBefore, candidateAfter, ["status", "supersedes"]);
  }
  assertMemoryFieldsUnchanged(existingBefore, existingAfter, ["status", "supersededBy"]);
}

function assertLinkedMemoryProvenancePreserved(
  before: MemoryRecord | undefined,
  after: MemoryRecord | undefined,
  role: string,
): void {
  requireResolution(Boolean(before) === Boolean(after), `Conflict ${role} memory link changed during resolution.`);
  if (!before || !after) {
    return;
  }
  requireResolution(before.id === after.id, `Conflict ${role} memory id changed during resolution.`);
  requireResolution(
    JSON.stringify(before.scope) === JSON.stringify(after.scope),
    `Conflict ${role} memory scope changed during resolution.`,
  );
  requireResolution(before.type === after.type, `Conflict ${role} memory type changed during resolution.`);
  requireResolution(before.sourceKind === after.sourceKind, `Conflict ${role} memory source kind changed during resolution.`);
  requireResolution(before.rawSource === after.rawSource, `Conflict ${role} memory raw source changed during resolution.`);
  requireResolution(
    JSON.stringify(before.metadata) === JSON.stringify(after.metadata),
    `Conflict ${role} memory metadata changed during resolution.`,
  );
}

function assertLinkedMemoryUnchanged(
  before: MemoryRecord | undefined,
  after: MemoryRecord | undefined,
  role: string,
): void {
  if (!before && !after) {
    return;
  }
  requireResolution(Boolean(before && after), `Conflict ${role} memory link changed during resolution.`);
  requireResolution(
    matchesResolutionSnapshot(after as MemoryRecord, before as MemoryRecord),
    `Conflict ${role} memory changed unexpectedly during resolution.`,
  );
}

function assertMemoryFieldsUnchanged(
  before: MemoryRecord,
  after: MemoryRecord,
  allowedChanges: Array<keyof ReturnType<typeof resolutionSnapshot>>,
): void {
  const beforeSnapshot = resolutionSnapshot(before);
  const afterSnapshot = resolutionSnapshot(after);
  for (const field of allowedChanges) {
    delete beforeSnapshot[field];
    delete afterSnapshot[field];
  }
  requireResolution(
    JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot),
    `Memory ${before.id} changed outside the authorized lifecycle fields.`,
  );
}

function restorationPatch(memory: MemoryRecord): UpdateMemoryPatch {
  return {
    type: memory.type,
    canonicalText: memory.canonicalText,
    rawSource: memory.rawSource ?? null,
    sourceKind: memory.sourceKind,
    status: memory.status,
    confidence: memory.confidence,
    importance: memory.importance,
    validFrom: memory.validFrom ?? null,
    validUntil: memory.validUntil ?? null,
    supersedes: [...memory.supersedes],
    supersededBy: memory.supersededBy ?? null,
    metadata: memory.metadata,
  };
}

function uniqueMutationSnapshots(applied: AppliedResolutionMutation[]): MemoryRecord[] {
  const snapshots = new Map<string, MemoryRecord>();
  for (const mutation of applied) {
    if (!snapshots.has(mutation.before.id)) {
      snapshots.set(mutation.before.id, mutation.before);
    }
  }
  return [...snapshots.values()];
}

function matchesResolutionSnapshot(memory: MemoryRecord, snapshot: MemoryRecord): boolean {
  return JSON.stringify(resolutionSnapshot(memory)) === JSON.stringify(resolutionSnapshot(snapshot));
}

function resolutionSnapshot(memory: MemoryRecord) {
  return {
    id: memory.id,
    scope: memory.scope,
    type: memory.type,
    canonicalText: memory.canonicalText,
    rawSource: memory.rawSource,
    sourceKind: memory.sourceKind,
    status: memory.status,
    confidence: memory.confidence,
    importance: memory.importance,
    validFrom: memory.validFrom?.toISOString(),
    validUntil: memory.validUntil?.toISOString(),
    supersedes: memory.supersedes,
    supersededBy: memory.supersededBy,
    createdAt: memory.createdAt.toISOString(),
    metadata: memory.metadata,
  };
}

function terminalResolutionRetryOutput(
  conflict: MemoryConflictRecord,
  input: MemoryResolveConflictInput,
  linked: LinkedConflictMemories,
): MemoryResolveConflictOutput {
  const expectedStatus = input.action === "dismiss_conflict" ? "dismissed" : "resolved";
  requireResolution(
    conflict.status === expectedStatus && conflict.resolution?.action === input.action,
    `Memory conflict ${conflict.id} is already ${conflict.status} with a different resolution.`,
  );
  requireResolution(
    conflict.resolution?.reason === input.reason,
    `Memory conflict ${conflict.id} was resolved with a different reason.`,
  );
  if (input.action === "merge") {
    requireResolution(
      conflict.resolution?.merged_text === input.merged_text,
      `Memory conflict ${conflict.id} was resolved with different merged text.`,
    );
  }
  requireResolution(conflict.resolvedAt instanceof Date, `Memory conflict ${conflict.id} has no resolution time.`);
  assertTerminalResolutionMemoryState(input, linked);
  conflictResolutionEventIds(conflict);
  return resolutionOutput(conflict as MemoryConflictRecord & { resolvedAt: Date }, input.action, linked);
}

function assertTerminalResolutionMemoryState(
  input: MemoryResolveConflictInput,
  linked: LinkedConflictMemories,
): void {
  if (input.action === "dismiss_conflict") {
    return;
  }
  const candidate = linked.candidate;
  requireResolution(candidate, `${input.action} requires a candidate memory.`);
  if (input.action === "reject_candidate") {
    requireResolution(candidate.status === "rejected", "Resolved rejection no longer matches candidate lifecycle state.");
    return;
  }
  requireResolution(
    candidate.status === "active" && candidate.supersededBy === undefined,
    "Resolved acceptance no longer matches candidate lifecycle state.",
  );
  if (input.action === "accept_candidate") {
    return;
  }
  const existing = linked.existing;
  requireResolution(existing, `${input.action} requires an existing memory.`);
  if (input.action === "keep_both") {
    requireResolution(
      existing.status === "active" && existing.supersededBy === undefined,
      "Resolved keep_both no longer matches existing memory lifecycle state.",
    );
    return;
  }
  requireResolution(
    candidate.supersedes.includes(existing.id) &&
      existing.status === "superseded" &&
      existing.supersededBy === candidate.id,
    `Resolved ${input.action} no longer has consistent supersession links.`,
  );
  if (input.action === "merge") {
    requireResolution(
      candidate.canonicalText === input.merged_text,
      "Resolved merge no longer matches the persisted candidate text.",
    );
  }
}

function isExpectedConflictResolution(
  conflict: MemoryConflictRecord | undefined,
  action: MemoryConflictResolutionAction,
  status: "resolved" | "dismissed",
  attemptId: string,
  eventIds: string[],
): conflict is MemoryConflictRecord & { resolvedAt: Date } {
  return (
    conflict?.status === status &&
    conflict.resolution?.action === action &&
    conflict.resolution?.attempt_id === attemptId &&
    arraysEqual(conflictResolutionEventIds(conflict), eventIds) &&
    conflict.resolvedAt instanceof Date
  );
}

function resolutionOutput(
  conflict: MemoryConflictRecord & { resolvedAt: Date },
  action: MemoryConflictResolutionAction,
  linked: LinkedConflictMemories,
): MemoryResolveConflictOutput {
  return {
    conflict_id: conflict.id,
    action,
    conflict_status: conflict.status as "resolved" | "dismissed",
    candidate_memory: linked.candidate ? toResolutionMemory(linked.candidate) : undefined,
    existing_memory: linked.existing ? toResolutionMemory(linked.existing) : undefined,
    event_ids: conflictResolutionEventIds(conflict),
    resolved_at: conflict.resolvedAt.toISOString(),
  };
}

function conflictResolutionEventIds(conflict: MemoryConflictRecord): string[] {
  const eventIds = conflict.resolution?.event_ids;
  requireResolution(
    Array.isArray(eventIds) && eventIds.every((eventId) => typeof eventId === "string" && eventId.length > 0),
    `Memory conflict ${conflict.id} has invalid resolution event ids.`,
  );
  return [...eventIds] as string[];
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function toResolutionMemory(memory: MemoryRecord): NonNullable<MemoryResolveConflictOutput["candidate_memory"]> {
  return {
    id: memory.id,
    text: memory.canonicalText,
    status: memory.status,
    source_kind: memory.sourceKind,
    supersedes: [...memory.supersedes],
    superseded_by: memory.supersededBy,
  };
}

function requireResolution(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new MemoryConflictResolutionError(message);
  }
}

export function createDefaultMemoryService(): ContinuityMemoryService {
  return new ContinuityMemoryService();
}

function createDefaultReasoningProvider(): MemoryReasoningProvider {
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
    try {
      return QwenMemoryProvider.fromEnv();
    } catch (error) {
      if (!(error instanceof QwenProviderError)) {
        throw error;
      }
    }
  }
  return new MockMemoryProvider();
}

function providerModeFor(provider: MemoryReasoningProvider): MemoryServiceRuntimeInfo["providerMode"] {
  if (provider instanceof QwenMemoryProvider) {
    return "qwen";
  }
  if (provider instanceof MockMemoryProvider) {
    return "mock";
  }
  return "custom";
}

function storeModeFor(store: MemoryStore): MemoryServiceRuntimeInfo["storeMode"] {
  if (store instanceof InMemoryMemoryStore) {
    return "in-memory";
  }
  if (store instanceof PostgresMemoryStore) {
    return "postgres";
  }
  return "custom";
}

function scopeFromBootstrap(input: ContinuityBootstrapInput, caller: CallerContext | undefined): MemoryScope {
  const scope = applyCallerAllowedDefaults({
    tenantId: isAuthEnforced(caller) ? caller.tenantId : DEFAULT_TENANT_ID,
    userId: input.user_id,
    agentProfileId: input.agent_profile,
    hostId: input.host,
    projectId: input.project?.id ?? input.project?.name,
    sessionId: input.session_id,
  }, caller);
  assertScopedRequestNarrowed(scope, caller, "continuity_bootstrap");
  return scope;
}

function scopeFromTool(scope: MemoryRecallInput["scopes"], caller: CallerContext | undefined): MemoryScope {
  const resolved = applyCallerAllowedDefaults({
    tenantId: scope?.tenant_id ?? (isAuthEnforced(caller) ? caller.tenantId : DEFAULT_TENANT_ID),
    userId: scope?.user_id ?? (isAuthEnforced(caller) ? caller.userId : DEFAULT_USER_ID),
    agentProfileId: scope?.agent_profile_id ?? (isAuthEnforced(caller) ? undefined : DEFAULT_AGENT_PROFILE_ID),
    hostId: scope?.host_id,
    projectId: scope?.project_id,
    sessionId: scope?.session_id,
    toolId: scope?.tool_id,
  }, caller);
  assertScopedRequestNarrowed(resolved, caller, "tool scope");
  return resolved;
}

function toProviderScope(scope: MemoryScope): Record<string, string | undefined> {
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    agentProfileId: scope.agentProfileId,
    hostId: scope.hostId,
    projectId: scope.projectId,
    sessionId: scope.sessionId,
    toolId: scope.toolId,
  };
}

function toStoredMemory(memory: MemoryRecord): StoredMemory {
  return {
    id: memory.id,
    type: memory.type,
    canonicalText: memory.canonicalText,
    scope: toProviderScope(memory.scope),
    validity: {
      status: memory.validUntil ? "time_bound" : "current",
      validFrom: memory.validFrom?.toISOString(),
      validUntil: memory.validUntil?.toISOString(),
    },
    confidence: memory.confidence,
    importance: memory.importance,
    status: memory.status === "deleted" || memory.status === "invalidated" || memory.status === "archived" ? "expired" : memory.status,
    sourceKind: mapCoreSourceKind(memory.sourceKind),
    metadata: memory.metadata,
  };
}

function toCreateMemoryInput(candidate: MemoryCandidate, fallbackScope: MemoryScope, status: MemoryStatus): CreateMemoryInput {
  return {
    scope: normalizeCandidateScope(candidate.scope, fallbackScope),
    type: candidate.type,
    canonicalText: candidate.canonicalText,
    rawSource: candidate.rawSource,
    sourceKind: mapProviderSourceKind(candidate.sourceKind),
    status: status === "rejected" ? "pending" : status,
    confidence: candidate.confidence,
    importance: candidate.importance,
    validFrom: candidate.validity.validFrom,
    validUntil: candidate.validity.validUntil,
    metadata: toJsonObject({
      ...(candidate.metadata ?? {}),
      sourceTrust: candidate.sourceTrust,
      safetyDecision: candidate.safety.decision,
      rationale: candidate.rationale,
      tags: candidate.tags ?? [],
    }),
  };
}

function normalizeCandidateScope(scope: MemoryCandidate["scope"], fallback: MemoryScope): MemoryScope {
  return {
    tenantId: scope.tenantId ?? fallback.tenantId,
    userId: scope.userId ?? fallback.userId,
    agentProfileId: scope.agentProfileId ?? fallback.agentProfileId,
    hostId: scope.hostId ?? fallback.hostId,
    projectId: scope.projectId ?? fallback.projectId,
    sessionId: scope.sessionId ?? fallback.sessionId,
    toolId: scope.toolId ?? fallback.toolId,
  };
}

function toCandidateMemory(candidate: MemoryCandidate, status: MemoryStatus | "rejected", id?: string): CandidateMemory {
  return {
    id: id ?? (candidate.metadata?.id as string | undefined),
    type: candidate.type,
    text: candidate.canonicalText,
    confidence: candidate.confidence,
    status,
    reason: candidate.rationale ?? candidate.safety.reasons.join("; "),
  };
}

function shouldHoldCandidateForConflictReview(conflict: ConflictResult): boolean {
  if (!conflict.conflicts.some(isRealProviderConflict)) {
    return false;
  }

  if (conflict.recommendedAction === "ask_user" || conflict.recommendedAction === "merge" || conflict.recommendedAction === "supersede") {
    return true;
  }

  return conflict.conflicts.some(
    (item) => item.suggestedAction === "ask_user" || item.suggestedAction === "merge" || item.suggestedAction === "supersede_existing",
  );
}

async function persistConflictRecords(
  store: MemoryStore,
  candidateMemory: MemoryRecord,
  conflict: ConflictResult,
  source: MemoryRememberInput["source"],
  caller: CallerContext | undefined,
): Promise<void> {
  for (const item of conflict.conflicts.filter(isRealProviderConflict)) {
    await store.addConflict(
      {
        tenantId: candidateMemory.scope.tenantId,
        candidateMemoryId: candidateMemory.id,
        existingMemoryId: item.existingMemoryId,
        conflictType: item.conflictType,
        severity: item.severity,
        recommendedAction: item.suggestedAction,
        reason: item.reason || conflict.reason,
        confidence: item.confidence,
        metadata: toJsonObject({
          source,
          provider_recommended_action: conflict.recommendedAction,
          provider_reason: conflict.reason,
        }),
      },
      {
        actor: callerActor(caller, { type: "agent", id: "memory_remember" }),
        reason: item.reason || conflict.reason,
      },
    );
  }
}

function isRealProviderConflict(item: ConflictResult["conflicts"][number]): boolean {
  return item.conflictType !== "none";
}

function toMemorySummary(memory: MemoryRecord, reason?: string): MemorySummary {
  return {
    id: memory.id,
    type: memory.type,
    text: memory.canonicalText,
    score: Math.min(1, memory.importance + memory.confidence * 0.1),
    reason: reason ?? `${memory.status} ${memory.type} memory`,
    status: memory.status,
  };
}

function toConflictResourceItem(conflict: MemoryConflictRecord, memoryById: Map<string, MemoryRecord>): JsonObject {
  const candidate = conflict.candidateMemoryId ? memoryById.get(conflict.candidateMemoryId) : undefined;
  const existing = conflict.existingMemoryId ? memoryById.get(conflict.existingMemoryId) : undefined;

  return toJsonObject({
    id: conflict.id,
    conflict_type: conflict.conflictType,
    severity: conflict.severity,
    recommended_action: conflict.recommendedAction,
    status: conflict.status,
    reason: conflict.reason,
    confidence: conflict.confidence,
    candidate_memory_id: conflict.candidateMemoryId,
    existing_memory_id: conflict.existingMemoryId,
    candidate_memory: candidate ? toMemorySummary(candidate) : null,
    existing_memory: existing ? toMemorySummary(existing) : null,
    created_at: conflict.createdAt,
    resolved_at: conflict.resolvedAt,
    metadata: conflict.metadata,
  }) ?? {};
}

function sourceKindFromRemember(source: MemoryRememberInput["source"]): SourceKind {
  if (source === "user_correction") return "user_correction";
  if (source === "explicit_user_request") return "user_direct";
  if (source === "agent_observation") return "agent_observation";
  return "run_summary";
}

function sourceTrustForKind(sourceKind: SourceKind): SourceTrust {
  if (sourceKind === "external_web") return "untrusted_external";
  if (sourceKind === "mcp_tool_description") return "mcp_tool_description";
  if (sourceKind === "tool_log") return "tool_output";
  if (sourceKind === "run_summary") return "internal_run";
  if (sourceKind === "user_correction" || sourceKind === "user_direct") return "user_direct";
  return "agent_observation";
}

function mapProviderSourceKind(sourceKind: SourceKind): MemorySourceKind {
  const map: Record<SourceKind, MemorySourceKind> = {
    agent_observation: "agent_observation",
    external_web: "external_web",
    import: "manual_import",
    mcp_tool_description: "mcp_tool_description",
    run_summary: "run_summary",
    tool_log: "tool_result",
    user_correction: "user_correction",
    user_direct: "user_assertion",
  };
  return map[sourceKind];
}

function mapCoreSourceKind(sourceKind: MemorySourceKind): SourceKind {
  const map: Partial<Record<MemorySourceKind, SourceKind>> = {
    agent_observation: "agent_observation",
    external_content: "external_web",
    external_web: "external_web",
    manual_import: "import",
    mcp_tool_description: "mcp_tool_description",
    post_run_reflection: "run_summary",
    run_reflection: "run_summary",
    run_summary: "run_summary",
    tool_result: "tool_log",
    user_assertion: "user_direct",
    user_correction: "user_correction",
    user_instruction: "user_direct",
    user_statement: "user_direct",
  };
  return map[sourceKind] ?? "agent_observation";
}

function groupContextPack(selectedTexts: string[], memories: MemoryRecord[]): ContinuityBootstrapOutput["context_pack"] {
  const byText = new Map(memories.map((memory) => [memory.canonicalText, memory]));
  const pack: ContinuityBootstrapOutput["context_pack"] = {
    user: [],
    procedures: [],
    project: [],
    tool_memory: [],
    failure_memory: [],
  };

  for (const text of selectedTexts.length > 0 ? selectedTexts : memories.map((memory) => memory.canonicalText)) {
    const memory = byText.get(text);
    if (!memory) {
      pack.user.push(text);
      continue;
    }
    if (memory.type === "procedure") pack.procedures.push(text);
    else if (memory.type === "project_fact" || memory.type === "decision_memory") pack.project.push(text);
    else if (memory.type === "tool_memory") pack.tool_memory.push(text);
    else if (memory.type === "failure_memory") pack.failure_memory.push(text);
    else pack.user.push(text);
  }

  return pack;
}

function resourceFilter(input: MemoryResourceRequest, caller: CallerContext | undefined): MemoryListFilter {
  if (isAuthEnforced(caller)) {
    return guardedResourceFilter(input, caller);
  }
  return demoResourceFilter(input);
}

function guardedResourceFilter(input: MemoryResourceRequest, caller: CallerContext): MemoryListFilter {
  if (input.name === "vault-pending") {
    return { scope: scopeForCallerResource(caller, {}, input.name), statuses: ["pending"] };
  }
  if (input.name === "agent-procedures") {
    return {
      scope: scopeForCallerResource(caller, { agentProfileId: input.variables.agent_profile_id }, input.name),
      types: ["procedure"],
    };
  }
  if (input.name === "agent-failures") {
    return {
      scope: scopeForCallerResource(caller, { agentProfileId: input.variables.agent_profile_id }, input.name),
      types: ["failure_memory"],
    };
  }
  if (input.name === "project-facts") {
    return {
      scope: scopeForCallerResource(caller, { projectId: input.variables.project_id }, input.name),
      types: ["project_fact", "decision_memory"],
    };
  }
  if (input.name === "project-tool-notes") {
    return {
      scope: scopeForCallerResource(caller, { projectId: input.variables.project_id }, input.name),
      types: ["tool_memory"],
    };
  }
  return { scope: scopeForCallerResource(caller, { userId: input.variables.user_id }, input.name) };
}

function scopeForCallerResource(
  caller: CallerContext,
  requested: Partial<Pick<MemoryScope, "tenantId" | "userId" | "agentProfileId" | "projectId">>,
  operation: string,
): MemoryScope {
  const scope = applyCallerAllowedDefaults({
    tenantId: requested.tenantId ?? caller.tenantId,
    userId: requested.userId ?? caller.userId,
    agentProfileId: requested.agentProfileId,
    projectId: requested.projectId,
  }, caller);
  assertScopedRequestNarrowed(scope, caller, `${operation} resource`);
  return scope;
}

function demoResourceFilter(input: MemoryResourceRequest): MemoryListFilter {
  if (input.name === "vault-pending") {
    return { statuses: ["pending"] };
  }
  if (input.name === "agent-procedures") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, agentProfileId: input.variables.agent_profile_id }, types: ["procedure"] };
  }
  if (input.name === "agent-failures") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, agentProfileId: input.variables.agent_profile_id }, types: ["failure_memory"] };
  }
  if (input.name === "project-facts") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, projectId: input.variables.project_id }, types: ["project_fact", "decision_memory"] };
  }
  if (input.name === "project-tool-notes") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, projectId: input.variables.project_id }, types: ["tool_memory"] };
  }
  return { scope: { tenantId: DEFAULT_TENANT_ID, userId: input.variables.user_id ?? DEFAULT_USER_ID } };
}

function scopeFromRun(run: RunRecord): MemoryScope {
  return {
    tenantId: run.tenantId,
    userId: run.userId,
    hostId: run.hostId,
    agentProfileId: run.agentProfileId,
    projectId: run.projectId,
  };
}

function toJsonObject(value: Record<string, unknown> | undefined): JsonObject | undefined {
  if (!value) {
    return undefined;
  }

  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      output[key] = toJsonValue(item);
    }
  }
  return output;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    return toJsonObject(value as Record<string, unknown>) ?? {};
  }
  return String(value);
}

async function seedDemoMemories(store: MemoryStore): Promise<void> {
  const existing = await store.listMemories({ scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID } });
  if (existing.length > 0) {
    return;
  }

  for (const memory of DEMO_MEMORIES) {
    await store.addMemory(memory, {
      actor: { type: "system", id: "demo_seed" },
      reason: "Seed AI Opportunity Scout demo memory.",
    });
  }
}

const DEMO_SCOPE: MemoryScope = {
  tenantId: DEFAULT_TENANT_ID,
  userId: DEFAULT_USER_ID,
  agentProfileId: DEFAULT_AGENT_PROFILE_ID,
};

const DEMO_MEMORIES: CreateMemoryInput[] = [
  {
    id: "demo-mem-pref-agent-memory-hackathons",
    scope: DEMO_SCOPE,
    type: "user_preference",
    canonicalText: "User prefers AI hackathons focused on AI Agents, MemoryAgent, persistent agent memory, persistent context, or agent workflow infrastructure.",
    rawSource: "Session 1 demo user statement.",
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.96,
    importance: 0.92,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-pref-credential-network-founder",
    scope: DEMO_SCOPE,
    type: "user_preference",
    canonicalText: "When comparing opportunities, user values credential lift, useful network, founder resources, mentor access, and product credibility over prize money alone.",
    rawSource: "Session 1 demo user preference.",
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.95,
    importance: 0.9,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-procedure-verify-deadline-eligibility-timezone",
    scope: DEMO_SCOPE,
    type: "procedure",
    canonicalText: "Before ranking or recommending a hackathon, verify the official deadline, submission timezone, region and eligibility rules, and track fit from primary sources; mark any unverified field as pending rather than confirmed.",
    rawSource: "Session 1 procedure requirement and Session 3 failure reflection.",
    sourceKind: "user_instruction",
    status: "active",
    confidence: 0.97,
    importance: 0.98,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-failure-region-eligibility-mistake",
    scope: DEMO_SCOPE,
    type: "failure_memory",
    canonicalText: "Previous opportunity scouting failed by recommending an event before checking whether China or Hong Kong participants were eligible. Treat region or eligibility mismatch as a hard disqualifier unless the user explicitly asks for a watchlist item.",
    rawSource: "Session 3 demo correction.",
    sourceKind: "post_run_reflection",
    status: "active",
    confidence: 0.93,
    importance: 0.96,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-decision-qwen-trae-cockroachdb-ranking",
    scope: {
      ...DEMO_SCOPE,
      projectId: "ai-opportunity-scout",
    },
    type: "decision_memory",
    canonicalText: "For the MVP demo ranking, prioritize Qwen Cloud Track 1 / MemoryAgent as P0 when deadline and eligibility are verified because it directly matches persistent agent memory and Qwen memory reasoning; consider TRAE P1 when it supports developer-agent workflow and network goals; keep CockroachDB P2 or watchlist unless database/backend resources materially improve the current build. Live facts remain verification gates.",
    rawSource: "Session 2 demo decision rubric.",
    sourceKind: "decision_record",
    status: "active",
    confidence: 0.88,
    importance: 0.86,
    metadata: { demoSeed: true },
  },
];
