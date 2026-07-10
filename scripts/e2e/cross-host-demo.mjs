#!/usr/bin/env node
import { runCrossHostScenario } from "./cross-host-scenario.mjs";

try {
  const proof = await runCrossHostScenario();

  console.log("HandoffBase cross-host continuity demo: PASS");
  console.log("Runtime: real Express Streamable HTTP; official MCP SDK clients; api_key/mock/in-memory");
  console.log(
    `JSON-RPC auth guard: HTTP ${proof.authBoundary.httpStatus}, error ${proof.authBoundary.jsonRpcCode}`,
  );
  console.log(`Host B before Host A writes: memories=${proof.baseline.memoryCount}`);
  console.log(
    `Host A writes: preference=${proof.hostA.preference.id} (${proof.hostA.preference.status}), ` +
      `procedure=${proof.hostA.procedure.id} (${proof.hostA.procedure.status})`,
  );
  console.log(
    `Host B / Project Alpha: recalled=${proof.hostB.recall.memoryIds.join(",")}; ` +
      `context_trace=${proof.hostB.recall.traceId}; retrieval_trace=${proof.hostB.trace.retrievalTraceId}`,
  );
  console.log(
    `Host C / Project Beta: user_preference_visible=${proof.hostC.userPreferenceVisible}; ` +
      `project_procedure_visible=${proof.hostC.projectProcedureVisible}; ` +
      `project_alpha_access_denied=${proof.hostC.projectAlphaAccessDenied}`,
  );
  console.log(
    `Forget: memory=${proof.forgetting.memoryId}; status=${proof.forgetting.status}; ` +
      `event=${proof.forgetting.eventId}`,
  );
  console.log(
    `Later Host B recall: used=${proof.forgetting.laterUsedMemoryIds.join(",")}; ` +
      `lifecycle_ignored=${proof.forgetting.retrievalIgnoredMemoryIds.join(",")}; ` +
      `trace=${proof.forgetting.retrievalTraceId}`,
  );
  console.log("Proof: cross-host continuity=yes; project isolation=yes; traceability=yes; forgetting=yes");
} catch (error) {
  console.error(`HandoffBase cross-host continuity demo: FAIL (${safeErrorMessage(error)})`);
  process.exitCode = 1;
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}
