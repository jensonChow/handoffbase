import assert from "node:assert/strict";
import test from "node:test";
import { CROSS_HOST_FIXTURE, runCrossHostScenario } from "../../scripts/e2e/cross-host-scenario.mjs";

test(
  "real HTTP MCP carries Host A memory to Host B with isolation, traces, and forgetting",
  { timeout: 30_000 },
  async () => {
    const proof = await runCrossHostScenario();

    assert.equal(proof.runtime.loopback, true);
    assert.ok(proof.runtime.ephemeralPort > 0);
    assert.equal(proof.runtime.health.authMode, "api_key");
    assert.equal(proof.runtime.health.providerMode, "mock");
    assert.equal(proof.runtime.health.storeMode, "in-memory");
    assert.deepEqual(proof.authBoundary, { httpStatus: 401, jsonRpcCode: -32001 });

    assert.equal(proof.baseline.memoryCount, 0);
    assert.equal(proof.hostA.preference.type, "user_preference");
    assert.equal(proof.hostA.preference.status, "active");
    assert.equal(proof.hostA.procedure.type, "procedure");
    assert.equal(proof.hostA.procedure.status, "active");

    assert.ok(proof.hostB.bootstrap.contextPack.user.includes(CROSS_HOST_FIXTURE.preferenceText));
    assert.ok(proof.hostB.bootstrap.contextPack.procedures.includes(CROSS_HOST_FIXTURE.procedureText));
    assert.deepEqual(
      [...proof.hostB.recall.memoryIds].sort(),
      [proof.hostA.preference.id, proof.hostA.procedure.id].sort(),
    );
    assert.deepEqual(
      [...proof.hostB.trace.usedMemoryIds].sort(),
      [proof.hostA.preference.id, proof.hostA.procedure.id].sort(),
    );
    assert.ok(proof.hostB.trace.retrievalTraceId);

    assert.equal(proof.hostC.userPreferenceVisible, true);
    assert.equal(proof.hostC.projectProcedureVisible, false);
    assert.equal(proof.hostC.procedureRecallCount, 0);
    assert.equal(proof.hostC.projectAlphaAccessDenied, true);

    assert.equal(proof.forgetting.memoryId, proof.hostA.procedure.id);
    assert.equal(proof.forgetting.status, "invalidated");
    assert.deepEqual(proof.forgetting.laterMemoryIds, [proof.hostA.preference.id]);
    assert.deepEqual(proof.forgetting.laterUsedMemoryIds, [proof.hostA.preference.id]);
    assert.deepEqual(proof.forgetting.retrievalIgnoredMemoryIds, [proof.hostA.procedure.id]);
    assert.match(proof.forgetting.retrievalIgnoredReasons[0], /lifecycle|validity/i);
  },
);
