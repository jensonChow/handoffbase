import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryRecord,
  InMemoryMemoryStore,
  rejectSensitiveText,
  SensitiveDataError,
  ValidationError
} from "../dist/index.js";

const scope = {
  tenantId: "tenant_1",
  userId: "user_1"
};

test("sensitive helper detects obvious credentials without returning the raw secret", () => {
  const check = rejectSensitiveText("password=super-secret-password-12345");

  assert.equal(check.ok, false);
  assert.equal(check.findings[0].type, "password");
  assert.match(check.findings[0].excerpt, /\[redacted\]/);
  assert.doesNotMatch(check.findings[0].excerpt, /super-secret-password-12345/);
});

test("memory validation rejects likely tokens and private keys", async () => {
  assert.throws(
    () =>
      createMemoryRecord({
        id: "bad-token",
        scope,
        type: "tool_memory",
        canonicalText: "Use GitHub token ghp_abcdefghijklmnopqrstuvwxyz123456 for deploys.",
        sourceKind: "tool_result"
      }),
    ValidationError
  );

  const store = new InMemoryMemoryStore();
  await assert.rejects(
    () =>
      store.addMemory({
        id: "bad-key",
        scope,
        type: "procedure",
        canonicalText:
          "-----BEGIN PRIVATE KEY-----\n0123456789abcdefghijklmnopqrstuvwxyz\n-----END PRIVATE KEY-----",
        sourceKind: "user_assertion"
      }),
    ValidationError
  );
});
