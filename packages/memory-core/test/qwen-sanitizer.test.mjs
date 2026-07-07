import test from "node:test";
import assert from "node:assert/strict";
import {
  QwenMemoryProvider,
  sanitizeProviderInput
} from "../dist/index.js";

function createJsonResponse(content) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        choices: [
          {
            message: {
              content
            }
          }
        ]
      });
    }
  };
}

test("provider input sanitizer redacts sensitive keys and caps large structures", () => {
  const sanitized = sanitizeProviderInput(
    {
      summary: `Keep this useful summary. password=super-secret-password-12345 ${"x".repeat(80)}`,
      tokenBudget: 900,
      headers: {
        authorization: "Bearer raw-authorization-token-that-must-not-leak",
        cookie: "sid=raw-cookie-value; theme=dark",
        "set-cookie": ["session=raw-set-cookie-value"]
      },
      messages: Array.from({ length: 4 }, (_, index) => ({
        role: "tool",
        content: `message-${index}`
      }))
    },
    {
      maxArrayLength: 2,
      maxObjectKeys: 3,
      maxStringLength: 48
    }
  );

  const body = JSON.stringify(sanitized);
  assert.doesNotMatch(body, /super-secret-password-12345/);
  assert.doesNotMatch(body, /raw-authorization-token-that-must-not-leak/);
  assert.doesNotMatch(body, /raw-cookie-value/);
  assert.doesNotMatch(body, /raw-set-cookie-value/);
  assert.match(body, /\[REDACTED_PASSWORD\]/);
  assert.match(body, /\[REDACTED_SENSITIVE_VALUE\]/);
  assert.match(body, /__truncated_object_keys__/);
  assert.equal(sanitized.tokenBudget, 900);
});

test("QwenMemoryProvider sanitizes request body before building provider prompt", async () => {
  let capturedBody = "";
  const fakeFetch = async (_url, init) => {
    capturedBody = String(init.body);
    return createJsonResponse(JSON.stringify({
      summary: "No durable memories.",
      new_memories: [],
      invalidated_memories: []
    }));
  };

  const provider = new QwenMemoryProvider({
    apiKey: "qwen-provider-key",
    fetch: fakeFetch
  });

  await provider.reflectRun({
    runId: "run-secret-sanitizer",
    summary: "Investigated tool output. api_key=sk-proj-rawapikeyrawapikeyrawapikey123",
    scopes: {
      tenantId: "tenant_1",
      userId: "user_1",
      projectId: "project_1"
    },
    sourceTrust: "internal_run",
    messages: [
      {
        role: "assistant",
        content: "Authorization: Bearer rawbearertokenrawbearertoken123456"
      }
    ],
    toolCalls: [
      {
        name: "fetch_customer",
        arguments: {
          password: "raw-password-value",
          token: "raw-token-value",
          nested: {
            private_key: "-----BEGIN PRIVATE KEY-----\nraw-private-key-value\n-----END PRIVATE KEY-----"
          }
        },
        result: `${"tool-log ".repeat(700)}tail-that-should-be-truncated`
      }
    ],
    outcome: "User accepted the sanitized summary."
  });

  assert.notEqual(capturedBody, "");
  assert.doesNotMatch(capturedBody, /sk-proj-rawapikeyrawapikeyrawapikey123/);
  assert.doesNotMatch(capturedBody, /rawbearertokenrawbearertoken123456/);
  assert.doesNotMatch(capturedBody, /raw-password-value/);
  assert.doesNotMatch(capturedBody, /raw-token-value/);
  assert.doesNotMatch(capturedBody, /raw-private-key-value/);
  assert.doesNotMatch(capturedBody, /tail-that-should-be-truncated/);
  assert.match(capturedBody, /\[REDACTED_API_KEY\]/);
  assert.match(capturedBody, /\[REDACTED_TOKEN\]/);
  assert.match(capturedBody, /\[REDACTED_SENSITIVE_VALUE\]/);
  assert.match(capturedBody, /TRUNCATED_/);
  assert.match(capturedBody, /run-secret-sanitizer/);
});
