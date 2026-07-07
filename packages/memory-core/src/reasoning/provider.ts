import type {
  ClassifiedMemory,
  ClassifyMemoryInput,
  ConflictInput,
  ConflictResult,
  ContextPack,
  ContextPackInput,
  ExtractMemoryInput,
  MemoryCandidate,
  ReflectRunInput,
  ReflectionResult,
  TraceExplanation,
  TraceInput
} from "./types.js";

export interface MemoryReasoningProvider {
  extractMemories(input: ExtractMemoryInput): Promise<MemoryCandidate[]>;
  classifyMemory(input: ClassifyMemoryInput): Promise<ClassifiedMemory>;
  detectConflicts(input: ConflictInput): Promise<ConflictResult>;
  buildContextPack(input: ContextPackInput): Promise<ContextPack>;
  reflectRun(input: ReflectRunInput): Promise<ReflectionResult>;
  explainMemoryUsage(input: TraceInput): Promise<TraceExplanation>;
}
