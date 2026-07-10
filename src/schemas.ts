import * as z from "zod/v4";
import {
  MEMORY_FEEDBACK_SIGNALS,
  MEMORY_SOURCE_KINDS,
  MEMORY_STATUSES,
  MEMORY_TYPES,
} from "@handoffbase/memory-core";

export const memoryTypes = MEMORY_TYPES;
export const memoryStatuses = MEMORY_STATUSES;
export const memorySourceKinds = MEMORY_SOURCE_KINDS;

export const MemoryTypeSchema = z.enum(memoryTypes);
export const MemoryStatusSchema = z.enum(memoryStatuses);
export const MemorySourceKindSchema = z.enum(memorySourceKinds);
export const MemoryFeedbackSignalSchema = z.enum(MEMORY_FEEDBACK_SIGNALS);

export const JsonObjectSchema = z.record(z.string(), z.unknown());

export const ScopeSchema = z.object({
  tenant_id: z.string().min(1).optional().describe("Tenant boundary for future multi-tenant storage."),
  user_id: z.string().min(1).optional().describe("User whose continuity memory is being accessed."),
  agent_profile_id: z.string().min(1).optional().describe("Agent profile scope such as coding-agent."),
  host_id: z.string().min(1).optional().describe("MCP host identifier such as codex or claude-code."),
  project_id: z.string().min(1).optional().describe("Project or workspace scope."),
  session_id: z.string().min(1).optional().describe("Current session or conversation identifier."),
  tool_id: z.string().min(1).optional().describe("External tool or integration scope."),
});

export const ProjectInputSchema = z.object({
  id: z.string().min(1).optional(),
  root: z.string().min(1).optional(),
  git_remote: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

export const MemorySummarySchema = z.object({
  id: z.string().min(1),
  type: MemoryTypeSchema,
  text: z.string(),
  score: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  status: MemoryStatusSchema.optional(),
});

export const CandidateMemorySchema = z.object({
  id: z.string().min(1).optional(),
  type: MemoryTypeSchema,
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  status: MemoryStatusSchema.optional(),
  reason: z.string().optional(),
});

export const ContextPackSchema = z.object({
  user: z.array(z.string()),
  procedures: z.array(z.string()),
  project: z.array(z.string()),
  tool_memory: z.array(z.string()),
  failure_memory: z.array(z.string()),
});

export const TraceMemorySchema = z.object({
  memory_id: z.string().min(1),
  reason: z.string(),
});

export const memoryConflictResolutionActions = [
  "accept_candidate",
  "reject_candidate",
  "supersede_existing",
  "merge",
  "keep_both",
  "dismiss_conflict",
] as const;

export const MemoryConflictResolutionActionSchema = z
  .enum(memoryConflictResolutionActions)
  .describe(
    "Resolution action: activate the candidate, reject it, supersede the existing memory, merge into the candidate, keep both active, or dismiss the conflict without changing memories.",
  );

export const ConflictResolutionMemorySchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  status: MemoryStatusSchema,
  source_kind: MemorySourceKindSchema,
  supersedes: z.array(z.string()),
  superseded_by: z.string().min(1).optional(),
});

export const continuityBootstrapInputShape = {
  host: z.string().min(1).describe("MCP host making the request."),
  agent_profile: z.string().min(1).describe("Agent profile requesting continuity context."),
  user_id: z.string().min(1).describe("User whose continuity context should be bootstrapped."),
  project: ProjectInputSchema.optional().describe("Project or repository scope for the current task."),
  session_id: z.string().min(1).optional(),
  task_hint: z.string().optional(),
  token_budget: z.number().int().positive().max(8000).optional(),
};

export const continuityBootstrapOutputShape = {
  context_pack: ContextPackSchema,
  memory_trace_id: z.string().min(1),
  suggested_next_tools: z.array(z.string()),
};

export const memoryRecallInputShape = {
  query: z.string().min(1),
  scopes: ScopeSchema.optional(),
  types: z.array(MemoryTypeSchema).optional(),
  limit: z.number().int().positive().max(50).optional(),
  token_budget: z.number().int().positive().max(8000).optional(),
};

export const memoryRecallOutputShape = {
  memories: z.array(MemorySummarySchema),
  context_block: z.string(),
  trace_id: z.string().min(1),
};

export const memoryRememberInputShape = {
  source: z
    .enum(["user_correction", "task_note", "agent_observation", "explicit_user_request"])
    .describe("Where the memory candidate came from."),
  content: z.string().min(1),
  scopes: ScopeSchema.optional(),
  approval_mode: z.enum(["pending", "active"]).optional(),
};

export const memoryRememberOutputShape = {
  candidate_memories: z.array(CandidateMemorySchema),
  warnings: z.array(z.string()).optional(),
};

export const memoryReflectInputShape = {
  run_id: z.string().min(1),
  summary: z.string().min(1),
  messages: z.array(JsonObjectSchema).optional(),
  tool_calls: z.array(JsonObjectSchema).optional(),
  outcome: z.string().optional(),
  scopes: ScopeSchema.optional(),
};

export const memoryReflectOutputShape = {
  new_memories: z.array(CandidateMemorySchema),
  invalidated_memories: z.array(z.string()),
  trace_id: z.string().min(1).optional(),
};

export const memoryUpdateInputShape = {
  memory_id: z.string().min(1),
  expected_status: MemoryStatusSchema.optional(),
  patch: z.object({
    text: z.string().min(1).optional(),
    status: MemoryStatusSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    importance: z.number().min(0).max(1).optional(),
    valid_from: z.string().min(1).optional(),
    valid_until: z.string().min(1).optional(),
    metadata: JsonObjectSchema.optional(),
  }),
  supersede_conflicting: z.boolean().optional(),
  reason: z.string().optional(),
};

export const memoryUpdateOutputShape = {
  memory: z.object({
    id: z.string().min(1),
    text: z.string().optional(),
    status: MemoryStatusSchema,
  }),
  event_id: z.string().min(1),
  warnings: z.array(z.string()).optional(),
};

export const memoryForgetInputShape = {
  memory_id: z.string().min(1),
  mode: z.enum(["invalidate", "archive", "expire", "hard_delete"]),
  reason: z.string().min(1),
};

export const memoryForgetOutputShape = {
  memory_id: z.string().min(1),
  mode: z.enum(["invalidate", "archive", "expire", "hard_delete"]),
  status: MemoryStatusSchema,
  event_id: z.string().min(1),
};

export const MemoryFeedbackRegressionFixtureSchema = z.object({
  schema_version: z.literal("1"),
  target: z.enum(["memory", "trace", "memory_and_trace"]),
  signal: MemoryFeedbackSignalSchema,
  memory_type: MemoryTypeSchema.optional(),
  memory_status: MemoryStatusSchema.optional(),
  scope_dimensions: z.array(z.string().min(1)),
  trace_query: z.string().optional(),
  run_task_hint: z.string().optional(),
  reason: z.string().optional(),
  correction: z.string().optional(),
});

export const memoryFeedbackInputShape = {
  memory_id: z.string().min(1).optional(),
  trace_id: z.string().min(1).optional(),
  signal: MemoryFeedbackSignalSchema,
  reason: z.string().trim().min(1).max(2000).optional(),
  correction: z.string().trim().min(1).max(4000).optional(),
  run_id: z.string().min(1).optional(),
};

export const memoryFeedbackOutputShape = {
  feedback_id: z.string().min(1),
  memory_id: z.string().min(1).optional(),
  trace_id: z.string().min(1).optional(),
  signal: MemoryFeedbackSignalSchema,
  created_at: z.string().min(1),
  correction_memory: z
    .object({
      id: z.string().min(1),
      text: z.string().min(1),
      type: MemoryTypeSchema,
      status: z.literal("pending"),
    })
    .optional(),
  regression_fixture: MemoryFeedbackRegressionFixtureSchema,
};

export const memoryTraceInputShape = {
  trace_id: z.string().min(1),
};

export const memoryTraceOutputShape = {
  used_memories: z.array(TraceMemorySchema),
  ignored_memories: z.array(TraceMemorySchema),
  excluded_memories: z.array(TraceMemorySchema),
};

export const memoryResolveConflictInputShape = {
  conflict_id: z.string().min(1).describe("Open memory conflict to resolve."),
  action: MemoryConflictResolutionActionSchema,
  merged_text: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Required for merge; becomes the candidate memory's canonical text."),
  reason: z.string().trim().min(1).describe("Auditable reason for the authorized resolution decision."),
};

export const memoryResolveConflictOutputShape = {
  conflict_id: z.string().min(1),
  action: MemoryConflictResolutionActionSchema,
  conflict_status: z.enum(["resolved", "dismissed"]),
  candidate_memory: ConflictResolutionMemorySchema.optional(),
  existing_memory: ConflictResolutionMemorySchema.optional(),
  event_ids: z.array(z.string().min(1)),
  resolved_at: z.string().min(1),
};

export const ContinuityBootstrapInputSchema = z.object(continuityBootstrapInputShape);
export const ContinuityBootstrapOutputSchema = z.object(continuityBootstrapOutputShape);
export const MemoryRecallInputSchema = z.object(memoryRecallInputShape);
export const MemoryRecallOutputSchema = z.object(memoryRecallOutputShape);
export const MemoryRememberInputSchema = z.object(memoryRememberInputShape);
export const MemoryRememberOutputSchema = z.object(memoryRememberOutputShape);
export const MemoryReflectInputSchema = z.object(memoryReflectInputShape);
export const MemoryReflectOutputSchema = z.object(memoryReflectOutputShape);
export const MemoryUpdateInputSchema = z.object(memoryUpdateInputShape);
export const MemoryUpdateOutputSchema = z.object(memoryUpdateOutputShape);
export const MemoryForgetInputSchema = z.object(memoryForgetInputShape);
export const MemoryForgetOutputSchema = z.object(memoryForgetOutputShape);
export const MemoryFeedbackInputSchema = z.object(memoryFeedbackInputShape).superRefine((input, context) => {
  if (!input.memory_id && !input.trace_id) {
    context.addIssue({
      code: "custom",
      path: ["memory_id"],
      message: "memory_id or trace_id is required.",
    });
  }
  if (input.correction && input.signal !== "unhelpful") {
    context.addIssue({
      code: "custom",
      path: ["correction"],
      message: "correction is only allowed for unhelpful feedback.",
    });
  }
});
export const MemoryFeedbackOutputSchema = z.object(memoryFeedbackOutputShape);
export const MemoryTraceInputSchema = z.object(memoryTraceInputShape);
export const MemoryTraceOutputSchema = z.object(memoryTraceOutputShape);
export const MemoryResolveConflictInputSchema = z.object(memoryResolveConflictInputShape).superRefine((input, context) => {
  if (input.action === "merge" && !input.merged_text?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["merged_text"],
      message: "merged_text is required when action is merge.",
    });
  }
});
export const MemoryResolveConflictOutputSchema = z.object(memoryResolveConflictOutputShape);

export type ContinuityBootstrapInput = z.infer<typeof ContinuityBootstrapInputSchema>;
export type ContinuityBootstrapOutput = z.infer<typeof ContinuityBootstrapOutputSchema>;
export type MemoryRecallInput = z.infer<typeof MemoryRecallInputSchema>;
export type MemoryRecallOutput = z.infer<typeof MemoryRecallOutputSchema>;
export type MemoryRememberInput = z.infer<typeof MemoryRememberInputSchema>;
export type MemoryRememberOutput = z.infer<typeof MemoryRememberOutputSchema>;
export type MemoryReflectInput = z.infer<typeof MemoryReflectInputSchema>;
export type MemoryReflectOutput = z.infer<typeof MemoryReflectOutputSchema>;
export type MemoryUpdateInput = z.infer<typeof MemoryUpdateInputSchema>;
export type MemoryUpdateOutput = z.infer<typeof MemoryUpdateOutputSchema>;
export type MemoryForgetInput = z.infer<typeof MemoryForgetInputSchema>;
export type MemoryForgetOutput = z.infer<typeof MemoryForgetOutputSchema>;
export type MemoryFeedbackInput = z.infer<typeof MemoryFeedbackInputSchema>;
export type MemoryFeedbackOutput = z.infer<typeof MemoryFeedbackOutputSchema>;
export type MemoryFeedbackRegressionFixture = z.infer<typeof MemoryFeedbackRegressionFixtureSchema>;
export type MemoryTraceInput = z.infer<typeof MemoryTraceInputSchema>;
export type MemoryTraceOutput = z.infer<typeof MemoryTraceOutputSchema>;
export type MemoryResolveConflictInput = z.infer<typeof MemoryResolveConflictInputSchema>;
export type MemoryResolveConflictOutput = z.infer<typeof MemoryResolveConflictOutputSchema>;
export type MemoryConflictResolutionAction = z.infer<typeof MemoryConflictResolutionActionSchema>;
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;
export type MemorySourceKind = z.infer<typeof MemorySourceKindSchema>;
export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type CandidateMemory = z.infer<typeof CandidateMemorySchema>;
export type MemorySummary = z.infer<typeof MemorySummarySchema>;
export type TraceMemory = z.infer<typeof TraceMemorySchema>;
