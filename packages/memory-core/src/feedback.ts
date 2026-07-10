import {
  type CreateMemoryFeedbackInput,
  type MemoryActor,
  type MemoryFeedbackRecord,
  type MutationOptions
} from "./types.js";
import { assertValidMemoryFeedbackRecord } from "./validation.js";
import { cloneJsonObject, generateUuid } from "./utils.js";

const SYSTEM_ACTOR: MemoryActor = { type: "system", id: "memory-core" };

export function createMemoryFeedbackRecord(
  input: CreateMemoryFeedbackInput,
  options: MutationOptions = {}
): MemoryFeedbackRecord {
  const feedback: MemoryFeedbackRecord = {
    id: input.id ?? generateUuid(),
    scope: { ...input.scope },
    signal: input.signal,
    actor: { ...(options.actor ?? SYSTEM_ACTOR) },
    regressionFixture: cloneJsonObject(input.regressionFixture),
    createdAt: options.now ? new Date(options.now.getTime()) : new Date(),
    metadata: cloneJsonObject(input.metadata)
  };

  setOptional(feedback, "memoryId", input.memoryId);
  setOptional(feedback, "traceId", input.traceId);
  setOptional(feedback, "runId", input.runId ?? options.runId);
  setOptional(feedback, "reason", input.reason?.trim() || undefined);
  setOptional(feedback, "correctionMemoryId", input.correctionMemoryId);

  assertValidMemoryFeedbackRecord(feedback);
  return feedback;
}

export function cloneMemoryFeedbackRecord(feedback: MemoryFeedbackRecord): MemoryFeedbackRecord {
  const clone: MemoryFeedbackRecord = {
    id: feedback.id,
    scope: { ...feedback.scope },
    signal: feedback.signal,
    actor: { ...feedback.actor },
    regressionFixture: cloneJsonObject(feedback.regressionFixture),
    createdAt: new Date(feedback.createdAt.getTime()),
    metadata: cloneJsonObject(feedback.metadata)
  };

  setOptional(clone, "memoryId", feedback.memoryId);
  setOptional(clone, "traceId", feedback.traceId);
  setOptional(clone, "runId", feedback.runId);
  setOptional(clone, "reason", feedback.reason);
  setOptional(clone, "correctionMemoryId", feedback.correctionMemoryId);
  return clone;
}

function setOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
