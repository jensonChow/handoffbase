import type {
  ContinuityBootstrapInput,
  ContinuityBootstrapOutput,
  MemoryForgetInput,
  MemoryForgetOutput,
  MemoryRecallInput,
  MemoryRecallOutput,
  MemoryReflectInput,
  MemoryReflectOutput,
  MemoryRememberInput,
  MemoryRememberOutput,
  MemoryTraceInput,
  MemoryTraceOutput,
  MemoryUpdateInput,
  MemoryUpdateOutput,
} from "../schemas.js";

export interface MemoryResourceRequest {
  name: string;
  uri: string;
  variables: Record<string, string>;
}

export interface MemoryResourceResult {
  uri: string;
  mimeType: string;
  text: string;
}

export interface MemoryService {
  continuityBootstrap(input: ContinuityBootstrapInput): Promise<ContinuityBootstrapOutput>;
  recall(input: MemoryRecallInput): Promise<MemoryRecallOutput>;
  remember(input: MemoryRememberInput): Promise<MemoryRememberOutput>;
  reflect(input: MemoryReflectInput): Promise<MemoryReflectOutput>;
  update(input: MemoryUpdateInput): Promise<MemoryUpdateOutput>;
  forget(input: MemoryForgetInput): Promise<MemoryForgetOutput>;
  trace(input: MemoryTraceInput): Promise<MemoryTraceOutput>;
  readResource(input: MemoryResourceRequest): Promise<MemoryResourceResult>;
}
