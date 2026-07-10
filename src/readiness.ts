import type { MemoryService, MemoryServiceRuntimeInfo } from "./services/memory-service.js";

export interface ReadinessCheckOptions {
  forceProvider?: boolean;
}

export interface DependencyReadiness {
  ok: boolean;
  mode: string;
  probe: "local" | "live";
  checkedAt: string;
  latencyMs: number;
  cached?: boolean;
  code?: string;
}

export interface RuntimeReadiness {
  ok: boolean;
  store: DependencyReadiness;
  provider: DependencyReadiness;
}

export type RuntimeReadinessCheck = (options?: ReadinessCheckOptions) => Promise<RuntimeReadiness>;

export interface RuntimeReadinessCheckOptions {
  service: MemoryService;
  storeProbe: () => Promise<void>;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
}

interface CachedProviderProbe {
  expiresAt: number;
  result: DependencyReadiness;
}

const DEFAULT_PROVIDER_CACHE_MS = 5 * 60 * 1_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;

export function createRuntimeReadinessCheck(options: RuntimeReadinessCheckOptions): RuntimeReadinessCheck {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const runtime = runtimeInfoForService(options.service);
  const cacheMs = readPositiveInteger(env.HANDOFFBASE_READINESS_CACHE_MS, DEFAULT_PROVIDER_CACHE_MS);
  let providerCache: CachedProviderProbe | undefined;
  let providerProbePromise: Promise<DependencyReadiness> | undefined;

  return async (checkOptions = {}) => {
    const storePromise = runProbe(runtime.storeMode, "live", options.storeProbe, now, "store_probe_failed");
    const providerPromise = checkProvider(checkOptions.forceProvider === true);
    const [store, provider] = await Promise.all([storePromise, providerPromise]);
    return {
      ok: store.ok && provider.ok,
      store,
      provider,
    };
  };

  async function checkProvider(force: boolean): Promise<DependencyReadiness> {
    if (runtime.providerMode === "mock") {
      return immediateSuccess("mock", now);
    }
    if (runtime.providerMode !== "qwen") {
      return immediateFailure(runtime.providerMode, now, "provider_probe_unavailable");
    }

    const timestamp = now();
    if (!force && providerCache && providerCache.expiresAt > timestamp) {
      return { ...providerCache.result, cached: true };
    }

    if (providerProbePromise) {
      return { ...(await providerProbePromise), cached: true };
    }

    providerProbePromise = runProbe(
      runtime.providerMode,
      "live",
      () => probeQwenProvider(env, fetchImpl),
      now,
      "provider_probe_failed",
    );
    try {
      const result = await providerProbePromise;
      providerCache = {
        expiresAt: now() + cacheMs,
        result,
      };
      return result;
    } finally {
      providerProbePromise = undefined;
    }
  }
}

export async function probeQwenProvider(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const apiKey = env.QWEN_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Qwen readiness credentials are not configured.");
  }

  const baseUrl =
    env.QWEN_BASE_URL?.trim() ||
    env.DASHSCOPE_BASE_URL?.trim() ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = env.QWEN_MODEL?.trim() || env.DASHSCOPE_MODEL?.trim() || "qwen-plus";
  const timeoutMs = readPositiveInteger(env.HANDOFFBASE_READINESS_TIMEOUT_MS, DEFAULT_PROVIDER_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(chatCompletionsEndpoint(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1,
        messages: [{ role: "user", content: "Reply with OK." }],
      }),
      signal: controller.signal,
    });
    await response.text();
    if (!response.ok) {
      throw new Error(`Qwen readiness probe failed with HTTP ${response.status}.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function runProbe(
  mode: string,
  probe: DependencyReadiness["probe"],
  operation: () => Promise<void>,
  now: () => number,
  failureCode: string,
): Promise<DependencyReadiness> {
  const startedAt = now();
  return operation().then(
    () => ({
      ok: true,
      mode,
      probe,
      checkedAt: new Date(now()).toISOString(),
      latencyMs: Math.max(0, now() - startedAt),
    }),
    () => ({
      ok: false,
      mode,
      probe,
      checkedAt: new Date(now()).toISOString(),
      latencyMs: Math.max(0, now() - startedAt),
      code: failureCode,
    }),
  );
}

function immediateSuccess(mode: string, now: () => number): DependencyReadiness {
  return {
    ok: true,
    mode,
    probe: "local",
    checkedAt: new Date(now()).toISOString(),
    latencyMs: 0,
  };
}

function immediateFailure(mode: string, now: () => number, code: string): DependencyReadiness {
  return {
    ok: false,
    mode,
    probe: "local",
    checkedAt: new Date(now()).toISOString(),
    latencyMs: 0,
    code,
  };
}

function chatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function runtimeInfoForService(service: MemoryService): MemoryServiceRuntimeInfo {
  return service.getRuntimeInfo?.() ?? {
    providerMode: "custom",
    storeMode: "custom",
  };
}
