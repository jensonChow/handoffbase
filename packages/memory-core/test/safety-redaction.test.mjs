import test from "node:test";
import assert from "node:assert/strict";
import { assessMemorySafety, rejectSensitiveText } from "../dist/index.js";

test("assessMemorySafety redacts credentials written as JSON-quoted keys", () => {
  const result = assessMemorySafety({
    text: 'saved config {"password":"plainpasswordvalue123"}',
    type: "project_fact",
    sourceTrust: "user_direct",
  });

  assert.doesNotMatch(result.redactedText, /plainpasswordvalue123/);
  assert.match(result.redactedText, /\[REDACTED_CREDENTIAL\]/);
  assert.notEqual(result.decision, "allow");
});

test("rejectSensitiveText flags a JSON-quoted credential assignment", () => {
  const check = rejectSensitiveText('{"api_key": "abcd1234plainvalue"}');

  // credential_assignment reports every keyword match under the "password" type.
  assert.equal(check.ok, false);
  assert.equal(check.findings[0].type, "password");
  assert.doesNotMatch(check.findings[0].excerpt, /abcd1234plainvalue/);
});

test("phone redaction leaves ISO dates and dotted version strings intact", () => {
  for (const benign of [
    "Contract renews 2024-01-15 for the vendor.",
    "Upgrade to version 1.2.3.4567890 before the demo.",
  ]) {
    const result = assessMemorySafety({
      text: benign,
      type: "project_fact",
      sourceTrust: "user_direct",
    });
    assert.doesNotMatch(result.redactedText, /REDACTED_PHONE/, `must not treat as a phone: ${benign}`);
    assert.equal(result.redactedText, benign, `benign content must be preserved: ${benign}`);
  }
});

test("phone redaction still catches real international phone numbers", () => {
  const result = assessMemorySafety({
    text: "Call +1 415 555 0199 before retrying.",
    type: "failure_memory",
    sourceTrust: "user_direct",
  });

  assert.match(result.redactedText, /\[REDACTED_PHONE\]/);
  assert.doesNotMatch(result.redactedText, /415 555 0199/);
});
