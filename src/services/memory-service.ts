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
import type { CallerContext } from "../auth/types.js";

export interface MemoryServiceContext {
  caller?: CallerContext;
}

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

export interface MemoryServiceRuntimeInfo {
  providerMode: "mock" | "qwen" | "custom";
  storeMode: "in-memory" | "postgres" | "custom";
}

export interface MemoryService {
  continuityBootstrap(input: ContinuityBootstrapInput, context?: MemoryServiceContext): Promise<ContinuityBootstrapOutput>;
  recall(input: MemoryRecallInput, context?: MemoryServiceContext): Promise<MemoryRecallOutput>;
  remember(input: MemoryRememberInput, context?: MemoryServiceContext): Promise<MemoryRememberOutput>;
  reflect(input: MemoryReflectInput, context?: MemoryServiceContext): Promise<MemoryReflectOutput>;
  update(input: MemoryUpdateInput, context?: MemoryServiceContext): Promise<MemoryUpdateOutput>;
  forget(input: MemoryForgetInput, context?: MemoryServiceContext): Promise<MemoryForgetOutput>;
  trace(input: MemoryTraceInput, context?: MemoryServiceContext): Promise<MemoryTraceOutput>;
  readResource(input: MemoryResourceRequest, context?: MemoryServiceContext): Promise<MemoryResourceResult>;
  getRuntimeInfo?(): MemoryServiceRuntimeInfo;
}

export function withCallerContext(service: MemoryService, caller: CallerContext): MemoryService {
  const context: MemoryServiceContext = { caller };
  return {
    continuityBootstrap: (input) => service.continuityBootstrap(input, context),
    recall: (input) => service.recall(input, context),
    remember: (input) => service.remember(input, context),
    reflect: (input) => service.reflect(input, context),
    update: (input) => service.update(input, context),
    forget: (input) => service.forget(input, context),
    trace: (input) => service.trace(input, context),
    readResource: (input) => service.readResource(input, context),
    getRuntimeInfo: () =>
      service.getRuntimeInfo?.() ?? {
        providerMode: "custom",
        storeMode: "custom",
      },
  };
}
