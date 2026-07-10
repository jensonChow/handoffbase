import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryMemoryStore, MockEmbeddingProvider } from "@handoffbase/memory-core";
import { ContinuityMemoryService } from "../src/services/continuity-memory-service.js";

const toolScopes = { tenant_id: "tenant_1", user_id: "user_1", agent_profile_id: "coding-agent" };

async function rememberActive(service: ContinuityMemoryService, content: string): Promise<string> {
  const result = await service.remember({ source: "user_assertion", content, scopes: toolScopes, approval_mode: "active" });
  const id = result.candidate_memories[0]?.id;
  assert.ok(id, `remember stored a memory for: ${content}`);
  return id;
}

test("service embeds on write and recall, surfacing embeddingMode", async () => {
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    embeddingProvider: new MockEmbeddingProvider({ dimensions: 128 }),
    seedDemoMemories: false,
  });

  assert.equal(service.getRuntimeInfo().embeddingMode, "mock");

  const darkId = await rememberActive(service, "The user prefers a dark editor color theme with low contrast at night.");
  await rememberActive(service, "The team deploys the service to production every Friday afternoon.");

  const recall = await service.recall({ query: "dark editor theme appearance", scopes: toolScopes, limit: 5 });
  assert.ok(recall.memories.length >= 2, "both memories are recalled");
  assert.equal(recall.memories[0].id, darkId, "embedding-ranked recall returns the closest memory first");
  assert.ok(recall.trace_id, "recall still produces an inspectable trace");
});

test("embedding provider defaults off and can be forced off without changing recall", async () => {
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    embeddingProvider: null,
    seedDemoMemories: false,
  });

  assert.equal(service.getRuntimeInfo().embeddingMode, "none");

  await rememberActive(service, "The user prefers a dark editor color theme with low contrast at night.");
  const recall = await service.recall({ query: "dark editor theme appearance", scopes: toolScopes, limit: 5 });
  assert.ok(recall.memories.length >= 1, "lexical recall still works with embeddings off");
});
