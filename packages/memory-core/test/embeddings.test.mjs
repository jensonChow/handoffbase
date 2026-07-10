import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryMemoryStore,
  MockEmbeddingProvider,
  QwenEmbeddingProvider,
  cosineSimilarity
} from "../dist/index.js";

const scope = { tenantId: "tenant_1", userId: "user_1" };

test("MockEmbeddingProvider is deterministic, sized, and L2-normalized", async () => {
  const provider = new MockEmbeddingProvider({ dimensions: 64 });
  const [a1] = await provider.embed(["prefers dark mode in the editor"]);
  const [a2] = await provider.embed(["prefers dark mode in the editor"]);
  assert.equal(a1.length, 64);
  assert.deepEqual(a1, a2, "same text embeds identically");

  const norm = Math.sqrt(a1.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9, "vector is unit length");

  const [related] = await provider.embed(["editor dark mode preference"]);
  const [unrelated] = await provider.embed(["deploys to production every friday"]);
  assert.ok(
    cosineSimilarity(a1, related) > cosineSimilarity(a1, unrelated),
    "shared vocabulary is closer than unrelated text"
  );
});

test("cosineSimilarity is safe on empty, mismatched, and zero vectors", () => {
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
});

test("in-memory recall blends semantic similarity when a query embedding is supplied", async () => {
  const store = new InMemoryMemoryStore();
  const provider = new MockEmbeddingProvider({ dimensions: 128 });

  const darkMode = "The user prefers a dark editor theme with low contrast.";
  const deadline = "The project submission deadline is July 20.";
  await store.addMemory({ id: "m-dark", scope, type: "user_preference", canonicalText: darkMode, sourceKind: "user_assertion" });
  await store.addMemory({ id: "m-deadline", scope, type: "project_fact", canonicalText: deadline, sourceKind: "user_assertion" });

  for (const [id, text] of [["m-dark", darkMode], ["m-deadline", deadline]]) {
    const [embedding] = await provider.embed([text]);
    await store.upsertEmbedding({ memoryId: id, embedding, embeddingModel: provider.model, createdAt: new Date() });
  }

  // Query shares NO literal tokens with the dark-mode memory ("theme"/"editor"
  // absent), so lexical scoring cannot distinguish it; semantic similarity must.
  const [queryEmbedding] = await provider.embed(["dark editor theme low contrast"]);
  const semantic = await store.recallMemories({ scope, query: "appearance settings", queryEmbedding, embeddingModel: provider.model, limit: 2 });
  assert.equal(semantic.memories[0].id, "m-dark", "semantically closest memory ranks first");

  // Without a query embedding, ranking falls back to the prior lexical behavior.
  const lexical = await store.recallMemories({ scope, query: "appearance settings", limit: 2 });
  assert.equal(lexical.memories.length, 2, "lexical recall still returns all matches");
});

test("QwenEmbeddingProvider posts to /embeddings and orders vectors by index", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(
      JSON.stringify({
        data: [
          { index: 1, embedding: [0.1, 0.2, 0.3] },
          { index: 0, embedding: [0.9, 0.8, 0.7] }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const provider = new QwenEmbeddingProvider({ apiKey: "secret-key", dimensions: 3, fetch: fakeFetch });
  const vectors = await provider.embed(["first", "second"]);

  assert.equal(vectors.length, 2);
  assert.deepEqual(vectors[0], [0.9, 0.8, 0.7], "index 0 comes first regardless of response order");
  assert.deepEqual(vectors[1], [0.1, 0.2, 0.3]);
  assert.match(calls[0].url, /\/embeddings$/);
  assert.equal(calls[0].body.model, "text-embedding-v4");
  assert.equal(calls[0].body.dimensions, 3);
  assert.equal(calls[0].auth, "Bearer secret-key");
});

test("QwenEmbeddingProvider requires an API key and redacts it in errors", async () => {
  assert.throws(() => new QwenEmbeddingProvider({}), /API key is required/);

  const failingFetch = async () =>
    new Response("upstream rejected token secret-key", { status: 401 });
  const provider = new QwenEmbeddingProvider({ apiKey: "secret-key", fetch: failingFetch });
  await assert.rejects(provider.embed(["x"]), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /secret-key/, "raw key must not leak");
    assert.match(error.message, /\[REDACTED_QWEN_API_KEY\]/);
    return true;
  });
});
