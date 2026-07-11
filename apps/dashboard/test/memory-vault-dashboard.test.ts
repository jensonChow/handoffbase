import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardRuntimeStatus } from "../src/components/dashboard-runtime-status";
import {
  AuditView,
  ConflictCard,
  MemoryVaultDashboard,
  TraceFeedbackPanel
} from "../src/components/memory-vault-dashboard";
import type {
  ConflictCandidate,
  DashboardRuntimeMode,
  TraceFeedback
} from "../src/lib/memory-client";

test("dashboard initially renders a clear loading state", () => {
  const html = renderToStaticMarkup(
    createElement(MemoryVaultDashboard, { clientMode: "http" })
  );

  assert.match(html, /Checking secure dashboard session/);
  assert.match(html, /Preparing caller-scoped memory records/);
});

test("global deletion history renders only safe tombstone fields", () => {
  const html = renderToStaticMarkup(
    createElement(AuditView, {
      events: [
        {
          id: "delete-event-1",
          memoryId: "deleted-memory-1",
          eventType: "deleted",
          actorType: "user",
          actorId: "dashboard-user",
          reason: "User requested permanent removal.",
          createdAt: "2026-07-10T05:00:00.000Z",
          hardDeleted: true,
          scopeLabel: "user / project"
        }
      ]
    })
  );

  // The audit log is the one surface that renders deleted memories. It must
  // only ever expose the safe tombstone fields — never the canonical content.
  assert.match(html, /Audit &amp; Deletion History/);
  assert.match(html, /deleted-memory-1/);
  assert.match(html, /User requested permanent removal/);
  assert.match(html, /dashboard-user/);
  assert.match(html, /scope: user \/ project/);
  assert.match(html, /content of deleted memories is never/);
  assert.doesNotMatch(html, /canonicalText|rawSource|SECRET_DELETED_CONTENT/);
});

test("unhelpful trace feedback surfaces the queued pending correction", () => {
  const feedback: TraceFeedback = {
    id: "feedback-1",
    traceId: "trace-1",
    rating: "unhelpful",
    reason: "Ranking ignored region eligibility.",
    correction: "Verify region eligibility before ranking.",
    correctionMemoryId: "mem_corr_01",
    createdAt: "2026-07-10T05:00:00.000Z",
    regressionFixture: {
      schema_version: "1",
      target: "trace",
      signal: "unhelpful",
      scope_dimensions: ["tenant", "user"]
    }
  };
  const html = renderToStaticMarkup(
    createElement(TraceFeedbackPanel, {
      traceId: "trace-1",
      feedback: [feedback],
      isMutating: false,
      onSubmit: () => {}
    })
  );

  assert.match(html, /Was this trace useful\?/);
  assert.match(html, /Ranking ignored region eligibility/);
  assert.match(html, /queued pending correction mem_corr_01/);
  assert.match(html, /Submit/);
  // The panel never renders the internal regression-fixture payload.
  assert.doesNotMatch(html, /scope_dimensions|schema_version/);
});

test("helpful feedback persists without offering a correction pointer", () => {
  const html = renderToStaticMarkup(
    createElement(TraceFeedbackPanel, {
      traceId: "trace-helpful",
      feedback: [
        {
          id: "feedback-helpful",
          traceId: "trace-helpful",
          rating: "helpful",
          reason: "Matched what I actually value.",
          createdAt: "2026-07-10T05:00:00.000Z",
          regressionFixture: {
            schema_version: "1",
            target: "trace",
            signal: "helpful",
            scope_dimensions: ["tenant", "user"]
          }
        }
      ],
      isMutating: false,
      onSubmit: () => {}
    })
  );

  assert.match(html, /Matched what I actually value/);
  assert.doesNotMatch(html, /queued pending correction/);
});

test("conflict card presents every resolution action with required audit inputs", () => {
  const conflict: ConflictCandidate = {
    id: "conflict-1",
    status: "open",
    conflictType: "contradiction",
    severity: "high",
    incoming: "Candidate fact",
    existing: "Existing fact",
    recommendation: "Review both facts.",
    recommendedAction: "merge",
    memoryType: "project_fact",
    scopeLabel: "user / project"
  };
  const html = renderToStaticMarkup(
    createElement(ConflictCard, {
      conflict,
      isMutating: false,
      onResolve: () => {}
    })
  );

  for (const label of [
    "Accept candidate",
    "Reject candidate",
    "Supersede existing",
    "Merge memories",
    "Keep both",
    "Dismiss conflict"
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Auditable reason \(required\)/);
  // The recommended action is "merge", so the merged-text field must be present.
  assert.match(html, /Merged canonical text \(required\)/);
});

test("runtime status labels all supported dashboard modes", () => {
  const expectations: Array<{
    mode: DashboardRuntimeMode;
    label: string;
    detail: RegExp;
  }> = [
    {
      mode: "mock_demo",
      label: "Mock demo",
      detail: /Browser-only demo data/
    },
    {
      mode: "server_in_memory",
      label: "Server in-memory",
      detail: /survive refresh while this server process remains alive/
    },
    {
      mode: "shared_persistent_store",
      label: "Shared persistent store",
      detail: /injected shared persistent store/
    }
  ];

  for (const expectation of expectations) {
    const html = renderToStaticMarkup(
      createElement(DashboardRuntimeStatus, { mode: expectation.mode })
    );

    assert.match(html, new RegExp(expectation.label));
    assert.match(html, expectation.detail);
    assert.match(html, new RegExp(`data-mode="${expectation.mode}"`));
  }
});
