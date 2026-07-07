export const MEMORY_TYPES = [
  "identity",
  "user_preference",
  "procedure",
  "project_fact",
  "tool_memory",
  "decision_memory",
  "failure_memory",
  "outcome_memory",
  "negative_preference",
  "skill"
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_STATUSES = [
  "pending",
  "active",
  "rejected",
  "superseded",
  "expired"
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const SOURCE_KINDS = [
  "user_correction",
  "user_direct",
  "agent_observation",
  "run_summary",
  "tool_log",
  "external_web",
  "mcp_tool_description",
  "import"
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_TRUST_LEVELS = [
  "user_direct",
  "internal_run",
  "agent_observation",
  "tool_output",
  "untrusted_external",
  "mcp_tool_description"
] as const;

export type SourceTrust = (typeof SOURCE_TRUST_LEVELS)[number];

export const SAFETY_DECISIONS = [
  "allow",
  "redact",
  "reject",
  "needs_review"
] as const;

export type SafetyDecision = (typeof SAFETY_DECISIONS)[number];

export interface MemoryScope {
  tenantId?: string;
  userId?: string;
  agentProfileId?: string;
  hostId?: string;
  projectId?: string;
  sessionId?: string;
  toolId?: string;
}

export interface MemoryValidity {
  status: "current" | "time_bound" | "expired" | "unknown";
  validFrom?: string;
  validUntil?: string;
  reason?: string;
}

export interface SafetyRedaction {
  kind: "credential" | "private_key" | "token" | "cookie" | "email" | "phone";
  replacement: string;
}

export interface SafetyAssessment {
  decision: SafetyDecision;
  sensitive: boolean;
  untrustedExternal: boolean;
  reasons: string[];
  redactions: SafetyRedaction[];
}

export interface MemoryCandidate {
  type: MemoryType;
  canonicalText: string;
  scope: MemoryScope;
  validity: MemoryValidity;
  confidence: number;
  importance: number;
  status: Extract<MemoryStatus, "pending" | "active" | "rejected">;
  sourceKind: SourceKind;
  sourceTrust: SourceTrust;
  rawSource?: string;
  evidence?: string[];
  tags?: string[];
  safety: SafetyAssessment;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export interface ClassifiedMemory extends MemoryCandidate {
  classificationReason: string;
}

export interface StoredMemory {
  id: string;
  type: MemoryType;
  canonicalText: string;
  scope: MemoryScope;
  validity: MemoryValidity;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  sourceKind?: SourceKind;
  sourceTrust?: SourceTrust;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryConflict {
  existingMemoryId: string;
  conflictType: "contradiction" | "supersedes" | "duplicate" | "scope_overlap" | "none";
  severity: "low" | "medium" | "high";
  reason: string;
  suggestedAction: "ignore" | "merge" | "supersede_existing" | "ask_user" | "keep_both";
  confidence: number;
}

export interface ConflictResult {
  conflicts: MemoryConflict[];
  recommendedAction: "accept" | "merge" | "supersede" | "ask_user" | "reject";
  reason: string;
}

export interface ContextPackMemory {
  memoryId: string;
  type: MemoryType;
  text: string;
  reason: string;
  score: number;
}

export interface IgnoredMemory {
  memoryId: string;
  reason: string;
}

export interface ContextPack {
  contextBlock: string;
  selectedMemories: ContextPackMemory[];
  ignoredMemories: IgnoredMemory[];
  tokenBudget: number;
  estimatedTokens: number;
  trace: {
    query: string;
    scope: MemoryScope;
  };
}

export interface InvalidatedMemory {
  memoryId: string;
  reason: string;
  supersededByCandidateText?: string;
}

export interface ReflectionResult {
  summary: string;
  newMemories: MemoryCandidate[];
  invalidatedMemories: InvalidatedMemory[];
}

export interface TraceMemoryExplanation {
  memoryId: string;
  reason: string;
  confidence: number;
}

export interface TraceExplanation {
  summary: string;
  usedMemories: TraceMemoryExplanation[];
  ignoredMemories: TraceMemoryExplanation[];
  excludedMemories: TraceMemoryExplanation[];
}

export interface ExtractMemoryInput {
  content: string;
  scopes: MemoryScope;
  sourceKind: SourceKind;
  sourceTrust?: SourceTrust;
  approvalMode?: "active" | "pending";
  taskHint?: string;
  now?: string;
}

export interface ClassifyMemoryInput {
  text: string;
  scopes: MemoryScope;
  sourceKind: SourceKind;
  sourceTrust?: SourceTrust;
  rawSource?: string;
  now?: string;
}

export interface ConflictInput {
  candidate: MemoryCandidate;
  existingMemories: StoredMemory[];
  now?: string;
}

export interface ContextPackInput {
  query: string;
  scopes: MemoryScope;
  memories: StoredMemory[];
  tokenBudget: number;
  now?: string;
}

export interface ReflectRunInput {
  runId: string;
  summary: string;
  scopes: MemoryScope;
  sourceTrust?: SourceTrust;
  messages?: Array<Record<string, unknown>>;
  toolCalls?: Array<Record<string, unknown>>;
  outcome?: string;
  now?: string;
}

export interface TraceInput {
  traceId?: string;
  query?: string;
  scopes?: MemoryScope;
  contextPack?: ContextPack;
  usedMemories?: ContextPackMemory[];
  ignoredMemories?: IgnoredMemory[];
  excludedMemories?: IgnoredMemory[];
}

export type ProviderMethod =
  | "extractMemories"
  | "classifyMemory"
  | "detectConflicts"
  | "buildContextPack"
  | "reflectRun"
  | "explainMemoryUsage";

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value);
}

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === "string" && (SOURCE_KINDS as readonly string[]).includes(value);
}

export function isSourceTrust(value: unknown): value is SourceTrust {
  return typeof value === "string" && (SOURCE_TRUST_LEVELS as readonly string[]).includes(value);
}
