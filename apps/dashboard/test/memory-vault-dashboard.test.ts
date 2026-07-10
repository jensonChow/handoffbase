import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardRuntimeStatus } from "../src/components/dashboard-runtime-status";
import { MemoryVaultDashboard } from "../src/components/memory-vault-dashboard";
import type { DashboardRuntimeMode } from "../src/lib/memory-client";

test("dashboard initially renders a clear loading state", () => {
  const html = renderToStaticMarkup(
    createElement(MemoryVaultDashboard, { clientMode: "http" })
  );

  assert.match(html, /Loading Memory Vault/);
  assert.match(html, /Fetching HandoffBase memory records/);
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
