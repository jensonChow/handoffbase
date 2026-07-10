import type {
  ContinuityBootstrapInput,
  ContinuityBootstrapOutput,
  MemoryForgetInput,
  MemoryForgetOutput,
  MemoryFeedbackInput,
  MemoryFeedbackOutput,
  MemoryRecallInput,
  MemoryRecallOutput,
  MemoryReflectInput,
  MemoryReflectOutput,
  MemoryResolveConflictInput,
  MemoryResolveConflictOutput,
  MemoryRememberInput,
  MemoryRememberOutput,
  MemoryStatus,
  MemoryTraceInput,
  MemoryTraceOutput,
  MemoryUpdateInput,
  MemoryUpdateOutput,
} from "../schemas.js";
import type { MemoryResourceRequest, MemoryResourceResult, MemoryService } from "./memory-service.js";

export class StubMemoryService implements MemoryService {
  async continuityBootstrap(input: ContinuityBootstrapInput): Promise<ContinuityBootstrapOutput> {
    return {
      context_pack: {
        user: [`stub: no user profile store is wired for ${input.user_id}`],
        procedures: ["stub: wire MemoryOrchestrator to populate durable procedures"],
        project: input.project?.name ? [`stub: project scope received for ${input.project.name}`] : [],
        tool_memory: [],
        failure_memory: [],
      },
      memory_trace_id: "trace_stub_bootstrap",
      suggested_next_tools: ["memory_recall", "memory_reflect"],
    };
  }

  async recall(_input: MemoryRecallInput): Promise<MemoryRecallOutput> {
    return {
      memories: [],
      context_block: "stub: no storage or retrieval backend is wired yet",
      trace_id: "trace_stub_recall",
    };
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberOutput> {
    return {
      candidate_memories: [
        {
          id: "mem_stub_candidate",
          type: "procedure",
          text: input.content,
          confidence: 0.5,
          status: input.approval_mode ?? "pending",
          reason: "stub: content echoed until extraction and classification providers are wired",
        },
      ],
      warnings: ["stub_memory_service_does_not_persist_or_classify_content"],
    };
  }

  async reflect(input: MemoryReflectInput): Promise<MemoryReflectOutput> {
    return {
      new_memories: [
        {
          id: "mem_stub_reflection",
          type: "outcome_memory",
          text: input.outcome ?? input.summary,
          confidence: 0.5,
          status: "pending",
          reason: "stub: reflection provider is not wired yet",
        },
      ],
      invalidated_memories: [],
      trace_id: "trace_stub_reflect",
    };
  }

  async update(input: MemoryUpdateInput): Promise<MemoryUpdateOutput> {
    return {
      memory: {
        id: input.memory_id,
        text: input.patch.text,
        status: input.patch.status ?? "active",
      },
      event_id: "event_stub_update",
      warnings: ["stub_memory_service_does_not_persist_updates"],
    };
  }

  async resolveConflict(input: MemoryResolveConflictInput): Promise<MemoryResolveConflictOutput> {
    return {
      conflict_id: input.conflict_id,
      action: input.action,
      conflict_status: input.action === "dismiss_conflict" ? "dismissed" : "resolved",
      event_ids: [],
      resolved_at: new Date(0).toISOString(),
    };
  }

  async forget(input: MemoryForgetInput): Promise<MemoryForgetOutput> {
    const statusByMode: Record<MemoryForgetInput["mode"], MemoryStatus> = {
      archive: "archived",
      expire: "expired",
      hard_delete: "deleted",
      invalidate: "invalidated",
    };

    return {
      memory_id: input.memory_id,
      mode: input.mode,
      status: statusByMode[input.mode],
      event_id: "event_stub_forget",
    };
  }

  async feedback(input: MemoryFeedbackInput): Promise<MemoryFeedbackOutput> {
    const target = input.memory_id && input.trace_id ? "memory_and_trace" : input.memory_id ? "memory" : "trace";
    return {
      feedback_id: "feedback_stub",
      memory_id: input.memory_id,
      trace_id: input.trace_id,
      signal: input.signal,
      created_at: new Date(0).toISOString(),
      correction_memory: input.correction
        ? {
            id: "memory_stub_feedback_correction",
            text: input.correction,
            type: "failure_memory",
            status: "pending",
          }
        : undefined,
      regression_fixture: {
        schema_version: "1",
        target,
        signal: input.signal,
        memory_type: input.correction ? "failure_memory" : undefined,
        scope_dimensions: ["tenant", "user"],
        reason: input.reason,
        correction: input.correction,
      },
    };
  }

  async trace(_input: MemoryTraceInput): Promise<MemoryTraceOutput> {
    return {
      used_memories: [],
      ignored_memories: [],
      excluded_memories: [],
    };
  }

  async readResource(input: MemoryResourceRequest): Promise<MemoryResourceResult> {
    return {
      uri: input.uri,
      mimeType: "application/json",
      text: JSON.stringify(
        {
          uri: input.uri,
          resource: input.name,
          variables: input.variables,
          status: "stub",
          note: "storage is not wired yet; this resource template is registered and readable",
        },
        null,
        2,
      ),
    };
  }
}
