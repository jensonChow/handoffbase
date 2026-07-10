import type { DashboardRuntimeMode } from "@/lib/memory-client";

type RuntimeCopy = {
  label: string;
  detail: string;
};

export const dashboardRuntimeCopy: Record<DashboardRuntimeMode, RuntimeCopy> = {
  mock_demo: {
    label: "Mock demo",
    detail: "Browser-only demo data. Changes reset on a full page reload."
  },
  server_in_memory: {
    label: "Server in-memory",
    detail:
      "Same-origin API. Changes survive refresh while this server process remains alive."
  },
  shared_persistent_store: {
    label: "Shared persistent store",
    detail: "Same-origin API backed by the injected shared persistent store."
  }
};

export function DashboardRuntimeStatus({
  mode
}: {
  mode?: DashboardRuntimeMode;
}) {
  const copy = mode
    ? dashboardRuntimeCopy[mode]
    : {
        label: "Server API",
        detail: "Connecting to the same-origin dashboard API."
      };

  return (
    <div
      className={`runtime-status runtime-status-${mode ?? "connecting"}`}
      data-mode={mode ?? "connecting"}
      role="status"
    >
      <span className="runtime-status-dot" aria-hidden="true" />
      <span>
        <strong>{copy.label}</strong>
        <small>{copy.detail}</small>
      </span>
    </div>
  );
}
