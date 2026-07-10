import { InMemoryMemoryStore, QwenMemoryProvider } from "@handoffbase/memory-core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntimeReadinessCheck } from "../src/readiness.js";
import { startHttpServer } from "../src/http.js";
import { ContinuityMemoryService } from "../src/services/continuity-memory-service.js";

test("Qwen readiness performs a live probe, caches it, and supports a forced refresh", async () => {
  let fetchCalls = 0;
  const requestBodies: unknown[] = [];
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1;
    requestBodies.push(JSON.parse(String(init?.body)) as unknown);
    return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 });
  };
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    seedDemoMemories: false,
    provider: new QwenMemoryProvider({ apiKey: "test-only-key", fetch: fakeFetch }),
  });
  let storeProbes = 0;
  const check = createRuntimeReadinessCheck({
    service,
    storeProbe: async () => {
      storeProbes += 1;
    },
    env: {
      QWEN_API_KEY: "test-only-key",
      HANDOFFBASE_READINESS_CACHE_MS: "60000",
    },
    fetch: fakeFetch,
  });

  const first = await check();
  const cached = await check();
  const refreshed = await check({ forceProvider: true });

  assert.equal(first.ok, true);
  assert.equal(first.provider.probe, "live");
  assert.equal(first.provider.cached, undefined);
  assert.equal(cached.provider.cached, true);
  assert.equal(refreshed.provider.cached, undefined);
  assert.equal(fetchCalls, 2);
  assert.equal(storeProbes, 3, "store probes are never cached");
  assert.equal((requestBodies[0] as { max_tokens: number }).max_tokens, 1);
});

test("concurrent Qwen readiness checks share one live provider request", async () => {
  let fetchCalls = 0;
  let releaseFetch: (() => void) | undefined;
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  const fakeFetch = async () => {
    fetchCalls += 1;
    await fetchGate;
    return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 });
  };
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    seedDemoMemories: false,
    provider: new QwenMemoryProvider({ apiKey: "test-only-key", fetch: fakeFetch }),
  });
  const check = createRuntimeReadinessCheck({
    service,
    storeProbe: async () => undefined,
    env: { QWEN_API_KEY: "test-only-key" },
    fetch: fakeFetch,
  });

  const checks = [check(), check(), check()];
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls, 1);
  releaseFetch?.();
  const results = await Promise.all(checks);
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(results.filter((result) => result.provider.cached === true).length, 2);
});

test("readiness reports dependency failures without leaking the response body", async () => {
  const sentinel = "sentinel-provider-secret";
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    seedDemoMemories: false,
    provider: new QwenMemoryProvider({ apiKey: "test-only-key" }),
  });
  const check = createRuntimeReadinessCheck({
    service,
    storeProbe: async () => {
      throw new Error("database-secret");
    },
    env: { QWEN_API_KEY: "test-only-key" },
    fetch: async () => new Response(sentinel, { status: 401 }),
  });

  const readiness = await check();
  const serialized = JSON.stringify(readiness);
  assert.equal(readiness.ok, false);
  assert.equal(readiness.store.code, "store_probe_failed");
  assert.equal(readiness.provider.code, "provider_probe_failed");
  assert.equal(serialized.includes(sentinel), false);
  assert.equal(serialized.includes("database-secret"), false);
});

test("loopback HTTP readiness can probe Qwen with local auth disabled and caches the result", async () => {
  let fetchCalls = 0;
  const fakeFetch = async () => {
    fetchCalls += 1;
    return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 });
  };
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    seedDemoMemories: false,
    provider: new QwenMemoryProvider({
      apiKey: "test-only-key",
      fetch: fakeFetch,
    }),
  });
  const readinessCheck = createRuntimeReadinessCheck({
    service,
    storeProbe: async () => undefined,
    env: { QWEN_API_KEY: "test-only-key" },
    fetch: fakeFetch,
  });
  const started = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    service,
    readinessCheck,
    authConfig: { mode: "disabled" },
  });

  try {
    const first = await fetch(new URL("/ready", started.url));
    const second = await fetch(new URL("/ready", started.url));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(fetchCalls, 1);
  } finally {
    await started.close();
  }
});

test("non-loopback insecure override never exposes an unauthenticated Qwen readiness probe", async () => {
  let fetchCalls = 0;
  const fakeFetch = async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  };
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    seedDemoMemories: false,
    provider: new QwenMemoryProvider({ apiKey: "test-only-key", fetch: fakeFetch }),
  });
  const readinessCheck = createRuntimeReadinessCheck({
    service,
    storeProbe: async () => undefined,
    env: { QWEN_API_KEY: "test-only-key" },
    fetch: fakeFetch,
  });
  const started = await startHttpServer({
    host: "0.0.0.0",
    port: 0,
    service,
    readinessCheck,
    authConfig: { mode: "disabled" },
    allowInsecureRemote: true,
    allowedHosts: ["127.0.0.1"],
  });

  try {
    const response = await fetch(new URL("/ready", started.url));
    assert.equal(response.status, 503);
    const payload = (await response.json()) as { code: string };
    assert.equal(payload.code, "readiness_auth_configuration_required");
    assert.equal(fetchCalls, 0);
  } finally {
    await started.close();
  }
});
