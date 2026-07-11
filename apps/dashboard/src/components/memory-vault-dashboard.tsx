"use client";

import {
  ArrowRight,
  Ban,
  Check,
  Clock3,
  Database,
  Eye,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Moon,
  Plug,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { dashboardRuntimeCopy } from "@/components/dashboard-runtime-status";
import {
  createMemoryClient,
  MemoryClientError,
  type ConflictCandidate,
  type ConflictResolutionAction,
  type ConflictResolutionInput,
  type DashboardRuntimeMode,
  type DashboardSession,
  type DashboardSnapshot,
  type MemoryClientMode,
  type MemoryEvent,
  type MemoryRecord,
  type MemoryStatus,
  type MemoryTrace,
  type MemoryType,
  type TraceFeedbackInput
} from "@/lib/memory-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewKey = "overview" | "vault" | "review" | "traces" | "audit";
type ThemeKey = "dark" | "light";

type LoadError = {
  kind: "configuration" | "load";
  message: string;
};

type MutationError = {
  kind: "mutation" | "refresh";
  message: string;
};

type EditState = {
  canonicalText: string;
  confidence: number;
  importance: number;
};

const MCP_ENDPOINT = "https://api.handoffbase.dev/mcp";

const mono = "var(--font-mono)";
const display = "var(--font-display)";

const memoryTypes: MemoryType[] = [
  "identity",
  "user_preference",
  "procedure",
  "project_fact",
  "tool_memory",
  "decision_memory",
  "failure_memory",
  "outcome_memory",
  "negative_preference",
  "skill"
];

const statuses: MemoryStatus[] = [
  "active",
  "pending",
  "invalidated",
  "expired",
  "superseded"
];

const mcpTools: Array<{ name: string; desc: string }> = [
  { name: "continuity_bootstrap", desc: "Context pack at session start" },
  { name: "memory_recall", desc: "Task-scoped retrieval" },
  { name: "memory_remember", desc: "Capture corrections & facts" },
  { name: "memory_reflect", desc: "Distill lessons after a run" },
  { name: "memory_update", desc: "Edit, merge, supersede" },
  { name: "memory_forget", desc: "Expire or hard-delete" },
  { name: "memory_trace", desc: "Explain used / ignored / excluded" },
  { name: "memory_resolve_conflict", desc: "Governed six-action resolution" },
  { name: "memory_feedback", desc: "Helpful / unhelpful + corrections" }
];

const connectHosts = ["claude-code", "codex", "cursor"] as const;
type ConnectHost = (typeof connectHosts)[number];

function connectSnippet(host: ConnectHost): string {
  switch (host) {
    case "codex":
      return `# ~/.codex/config.toml
[mcp_servers.handoffbase]
url = "${MCP_ENDPOINT}"
http_headers = { Authorization = "Bearer $HANDOFFBASE_API_KEY" }`;
    case "cursor":
      return `// .cursor/mcp.json
{
  "mcpServers": {
    "handoffbase": {
      "url": "${MCP_ENDPOINT}",
      "headers": { "Authorization": "Bearer $HANDOFFBASE_API_KEY" }
    }
  }
}`;
    case "claude-code":
    default:
      return `claude mcp add --transport http handoffbase \\
  ${MCP_ENDPOINT} \\
  --header "Authorization: Bearer $HANDOFFBASE_API_KEY"`;
  }
}

// ---------------------------------------------------------------------------
// Formatting + style helpers
// ---------------------------------------------------------------------------

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function token(value: string): string {
  return value.replaceAll("_", " ");
}

function fmt(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function fmtDay(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function relativeTime(iso: string | null): string {
  if (!iso) {
    return "just now";
  }
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 45_000) {
    return "just now";
  }
  const mins = Math.round(diff / 60_000);
  if (mins < 60) {
    return `${mins} min ago`;
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return `${hrs} h ago`;
  }
  return `${Math.round(hrs / 24)} d ago`;
}

function scopeShort(memory: MemoryRecord): string {
  const scope = memory.scope;
  const parts = [scope.projectId, scope.hostId, scope.toolId].filter(Boolean);
  if (!parts.length) {
    parts.push("user");
  }
  return parts.join(" · ");
}

function statusColorVar(status: MemoryStatus): string {
  const map: Record<MemoryStatus, string> = {
    active: "var(--good)",
    pending: "var(--warn)",
    invalidated: "var(--bad)",
    expired: "var(--bad)",
    superseded: "var(--info)"
  };
  return map[status] ?? "var(--muted)";
}

function eventToneVar(eventType: MemoryEvent["eventType"]): string {
  const map: Record<MemoryEvent["eventType"], string> = {
    created: "var(--chip)",
    approved: "var(--good)",
    recalled: "var(--good)",
    updated: "var(--muted)",
    invalidated: "var(--warn)",
    deleted: "var(--bad)"
  };
  return map[eventType] ?? "var(--muted)";
}

function chipStyle(colorVar: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid color-mix(in srgb, ${colorVar} 40%, transparent)`,
    background: `color-mix(in srgb, ${colorVar} 8%, transparent)`,
    color: colorVar,
    borderRadius: 999,
    padding: "3px 9px",
    fontFamily: mono,
    fontSize: 11,
    whiteSpace: "nowrap"
  };
}

function badgeStyle(status: MemoryStatus): CSSProperties {
  return { ...chipStyle(statusColorVar(status)), textTransform: "none" };
}

const typeTagStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: 10.5,
  color: "var(--chip)",
  border: "1px solid color-mix(in srgb, var(--chip) 45%, transparent)",
  borderRadius: 5,
  padding: "1px 6px",
  whiteSpace: "nowrap"
};

const monoSubtle: CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  color: "var(--subtle)"
};

const uppercaseLabel: CSSProperties = {
  fontFamily: mono,
  fontSize: 10.5,
  color: "var(--subtle)",
  letterSpacing: "0.06em",
  textTransform: "uppercase"
};

function panel(extra?: CSSProperties): CSSProperties {
  return {
    border: "1px solid var(--line)",
    borderRadius: 13,
    background: "var(--panel)",
    ...extra
  };
}

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 32,
  padding: "0 13px",
  borderRadius: 8,
  border: 0,
  background: "var(--accent)",
  color: "var(--accent-ink)",
  fontWeight: 600,
  fontSize: 12.5
};

const ghostBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 32,
  padding: "0 13px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--muted)",
  fontSize: 12.5
};

const selectStyle: CSSProperties = {
  minHeight: 38,
  padding: "0 10px",
  border: "1px solid var(--line)",
  borderRadius: 9,
  background: "var(--inset)",
  color: "var(--muted)",
  outline: "none",
  fontSize: 13
};

function resourceUriFor(memory: MemoryRecord, userId: string): string {
  if (memory.status === "pending") {
    return "memory://vault/pending";
  }
  const agent = memory.scope.agentProfileId ?? "shared";
  const project = memory.scope.projectId ?? "shared";
  const map: Partial<Record<MemoryType, string>> = {
    identity: `memory://users/${userId}/profile`,
    user_preference: `memory://users/${userId}/profile`,
    negative_preference: `memory://users/${userId}/profile`,
    procedure: `memory://agents/${agent}/procedures`,
    failure_memory: `memory://agents/${agent}/failures`,
    tool_memory: `memory://projects/${project}/tool-notes`
  };
  return map[memory.type] ?? `memory://projects/${project}/facts`;
}

type TraceMeta = { mode: string; budget: number; est: number };

function traceMeta(trace: MemoryTrace): TraceMeta {
  const mode = String(trace.metadata?.recall_mode ?? "memory_recall");
  const budget = Number(trace.metadata?.context_budget_tokens ?? 640) || 640;
  const est = Math.min(budget, Math.max(1, Math.round(trace.contextPack.length / 4)));
  return { mode, budget, est };
}

function shortMode(mode: string): string {
  return mode.replace("continuity_", "").replace("memory_", "");
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function MemoryVaultDashboard({
  clientMode = "http"
}: {
  clientMode?: MemoryClientMode;
}) {
  const client = useMemo(
    () =>
      clientMode === "mock"
        ? createMemoryClient({ mode: "mock" })
        : createMemoryClient({ mode: "http" }),
    [clientMode]
  );

  const [view, setView] = useState<ViewKey>("overview");
  const [theme, setTheme] = useState<ThemeKey>("dark");
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MemoryType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MemoryStatus>("all");
  const [hostFilter, setHostFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [mutationError, setMutationError] = useState<MutationError | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [connectHost, setConnectHost] = useState<ConnectHost>("claude-code");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync theme onto <html> so token overrides and page background flip together.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hb-theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
      }
    } catch {
      // Ignore storage failures (private mode, disabled cookies, SSR).
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem("hb-theme", theme);
    } catch {
      // Ignore storage failures.
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setMutationError(null);
      const data = await client.listDashboard();
      setSnapshot(data);
      setLastSyncedAt(new Date().toISOString());
      setSelectedMemoryId((current) =>
        data.memories.some((memory) => memory.id === current)
          ? current
          : data.memories[0]?.id ?? ""
      );
      setSelectedTraceId((current) =>
        data.traces.some((trace) => trace.id === current)
          ? current
          : data.traces[0]?.id ?? ""
      );
    } catch (caught) {
      if (caught instanceof MemoryClientError && caught.status === 401) {
        setSession((current) => ({
          authenticated: false,
          authMode: current?.authMode ?? "api_key"
        }));
        setSnapshot(null);
      }
      setLoadError(toLoadError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const initializeDashboard = useCallback(async () => {
    try {
      setIsCheckingSession(true);
      setLoadError(null);
      const currentSession = await client.getSession();
      setSession(currentSession);
      if (currentSession.authenticated) {
        await loadDashboard();
      } else {
        setIsLoading(false);
      }
    } catch (caught) {
      setLoadError(toLoadError(caught));
      setIsLoading(false);
    } finally {
      setIsCheckingSession(false);
    }
  }, [client, loadDashboard]);

  useEffect(() => {
    void initializeDashboard();
  }, [initializeDashboard]);

  const selectedMemory = useMemo(
    () => snapshot?.memories.find((memory) => memory.id === selectedMemoryId),
    [selectedMemoryId, snapshot]
  );

  const selectedTrace = useMemo(
    () => snapshot?.traces.find((trace) => trace.id === selectedTraceId),
    [selectedTraceId, snapshot]
  );

  const selectedEvents = useMemo(() => {
    if (!snapshot || !selectedMemoryId) {
      return [];
    }
    return snapshot.events
      .filter((event) => event.memoryId === selectedMemoryId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [selectedMemoryId, snapshot]);

  useEffect(() => {
    if (!selectedMemory) {
      setEditState(null);
      return;
    }
    setEditState({
      canonicalText: selectedMemory.canonicalText,
      confidence: selectedMemory.confidence,
      importance: selectedMemory.importance
    });
    setDeleteConfirm(false);
  }, [selectedMemory]);

  const pendingMemories = useMemo(
    () => snapshot?.memories.filter((memory) => memory.status === "pending") ?? [],
    [snapshot]
  );

  const filteredMemories = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.memories.filter((memory) => {
      const haystack = [
        memory.id,
        memory.type,
        memory.status,
        memory.canonicalText,
        memory.source.label,
        scopeShort(memory)
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase().trim());
      const matchesType = typeFilter === "all" || memory.type === typeFilter;
      const matchesStatus = statusFilter === "all" || memory.status === statusFilter;
      const matchesHost =
        hostFilter === "all" ||
        memory.scope.hostId === hostFilter ||
        memory.scope.toolId === hostFilter;
      return matchesQuery && matchesType && matchesStatus && matchesHost;
    });
  }, [hostFilter, query, snapshot, statusFilter, typeFilter]);

  const hostOptions = useMemo(() => {
    const hosts = new Set<string>();
    for (const memory of snapshot?.memories ?? []) {
      if (memory.scope.hostId) {
        hosts.add(memory.scope.hostId);
      }
      if (memory.scope.toolId) {
        hosts.add(memory.scope.toolId);
      }
    }
    return Array.from(hosts).sort();
  }, [snapshot]);

  const stats = useMemo(() => {
    const memories = snapshot?.memories ?? [];
    const conflicts = snapshot?.conflicts ?? [];
    return {
      total: memories.length,
      active: memories.filter((memory) => memory.status === "active").length,
      pending: pendingMemories.length,
      conflicts: conflicts.length,
      traces: snapshot?.traces.length ?? 0,
      events: snapshot?.events.length ?? 0,
      review: pendingMemories.length + conflicts.length
    };
  }, [pendingMemories.length, snapshot]);

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key);
    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
    copyTimer.current = setTimeout(() => setCopiedKey(null), 1400);
  }, []);

  const copyText = useCallback(
    async (key: string, value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        flashCopied(key);
      } catch {
        // Clipboard can be unavailable (insecure origin / denied permission).
      }
    },
    [flashCopied]
  );

  const refreshAfterMutation = useCallback(
    async (selectId?: string) => {
      const data = await client.listDashboard();
      setSnapshot(data);
      setLastSyncedAt(new Date().toISOString());
      if (selectId && data.memories.some((memory) => memory.id === selectId)) {
        setSelectedMemoryId(selectId);
        return;
      }
      setSelectedMemoryId((current) =>
        data.memories.some((memory) => memory.id === current)
          ? current
          : data.memories[0]?.id ?? ""
      );
    },
    [client]
  );

  const runMutation = useCallback(
    async (action: () => Promise<unknown>, selectId?: string) => {
      let mutationCompleted = false;
      try {
        setIsMutating(true);
        setLoadError(null);
        setMutationError(null);
        await action();
        mutationCompleted = true;
        await refreshAfterMutation(selectId);
      } catch (caught) {
        setMutationError({
          kind: mutationCompleted ? "refresh" : "mutation",
          message:
            caught instanceof Error ? caught.message : "The memory change failed."
        });
      } finally {
        setIsMutating(false);
      }
    },
    [refreshAfterMutation]
  );

  const selectMemory = useCallback((memoryId: string, goVault: boolean) => {
    setSelectedMemoryId(memoryId);
    if (goVault) {
      setView("vault");
    }
  }, []);

  async function login() {
    try {
      setIsLoggingIn(true);
      setLoadError(null);
      const nextSession = await client.login(apiKey);
      setSession(nextSession);
      setApiKey("");
      await loadDashboard();
    } catch (caught) {
      setLoadError(toLoadError(caught));
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await client.logout();
    } finally {
      setSession({ authenticated: false, authMode: "api_key" });
      setSnapshot(null);
      setSelectedMemoryId("");
      setSelectedTraceId("");
    }
  }

  // ---- Mutations bound to the real memory client ----

  const approve = useCallback(
    (memoryId: string) =>
      void runMutation(() => client.approveMemory(memoryId), memoryId),
    [client, runMutation]
  );
  const reject = useCallback(
    (memoryId: string) =>
      void runMutation(
        () => client.invalidateMemory(memoryId, "Rejected from review queue."),
        memoryId
      ),
    [client, runMutation]
  );
  const invalidate = useCallback(
    (memoryId: string) =>
      void runMutation(
        () => client.invalidateMemory(memoryId, "Invalidated from detail panel."),
        memoryId
      ),
    [client, runMutation]
  );
  const remove = useCallback(
    (memoryId: string) =>
      void runMutation(
        () =>
          client.deleteMemory(
            memoryId,
            "Hard delete requested from dashboard. Content removed; tombstone kept."
          ),
        ""
      ),
    [client, runMutation]
  );
  const saveEdit = useCallback(() => {
    if (!selectedMemory || !editState) {
      return;
    }
    void runMutation(
      () =>
        client.updateMemory(selectedMemory.id, {
          canonicalText: editState.canonicalText,
          confidence: editState.confidence,
          importance: editState.importance
        }),
      selectedMemory.id
    );
  }, [client, editState, runMutation, selectedMemory]);
  const resolveConflict = useCallback(
    (conflictId: string, input: ConflictResolutionInput) =>
      void runMutation(() => client.resolveConflict(conflictId, input)),
    [client, runMutation]
  );
  const submitFeedback = useCallback(
    (traceId: string, input: TraceFeedbackInput) =>
      void runMutation(() => client.submitTraceFeedback(traceId, input)),
    [client, runMutation]
  );

  // ---- Gates ----

  if (isCheckingSession) {
    return (
      <ThemedShell theme={theme}>
        <DashboardLoading title="Checking secure dashboard session" />
      </ThemedShell>
    );
  }

  if (!session?.authenticated) {
    return (
      <ThemedShell theme={theme}>
        <LoginGate
          apiKey={apiKey}
          error={loadError}
          isLoggingIn={isLoggingIn}
          setApiKey={setApiKey}
          onLogin={() => void login()}
          onRetry={() => void initializeDashboard()}
        />
      </ThemedShell>
    );
  }

  if (isLoading && !snapshot) {
    return (
      <ThemedShell theme={theme}>
        <DashboardLoading title="Loading Memory Vault" />
      </ThemedShell>
    );
  }

  const userId = session.caller?.userId ?? "demo-user";
  const tenantId = session.caller?.tenantId ?? "demo-tenant";
  const runtimeMode: DashboardRuntimeMode | undefined = snapshot?.runtime.mode;

  const headings: Record<ViewKey, [string, string]> = {
    overview: [
      snapshot?.traces[0] ? `Overview · ${fmtDay(snapshot.traces[0].createdAt)}` : "Overview",
      overviewTitle(snapshot)
    ],
    vault: ["Memory Vault", "Every durable fact, in one governed store"],
    review: ["Governance", "Approve what agents are allowed to remember"],
    traces: ["Explainability", "Why the agent knew what it knew"],
    audit: ["Caller-scoped governance", "Every lifecycle change, on the record"]
  };

  const navItems: Array<{
    key: ViewKey;
    label: string;
    icon: ReactNode;
    count: number | null;
    hot?: boolean;
  }> = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} aria-hidden />, count: null },
    { key: "vault", label: "Memory Vault", icon: <Database size={16} aria-hidden />, count: stats.total },
    {
      key: "review",
      label: "Review Queue",
      icon: <Inbox size={16} aria-hidden />,
      count: stats.review,
      hot: stats.review > 0
    },
    { key: "traces", label: "Traces", icon: <GitBranch size={16} aria-hidden />, count: stats.traces },
    { key: "audit", label: "Audit Log", icon: <History size={16} aria-hidden />, count: stats.events }
  ];

  return (
    <div
      data-theme={theme}
      data-screen-label="HandoffBase dashboard"
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-ui)",
        display: "grid",
        gridTemplateColumns: "252px minmax(0,1fr)"
      }}
    >
      {/* ================= SIDEBAR ================= */}
      <aside
        aria-label="Navigation"
        style={{
          borderRight: "1px solid var(--line2)",
          background: "var(--side)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          position: "sticky",
          top: 0,
          height: "100vh",
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "var(--accent)",
              display: "grid",
              placeItems: "center",
              color: "var(--accent-ink)",
              flex: "0 0 auto"
            }}
          >
            <Database size={18} aria-hidden />
          </span>
          <span style={{ display: "grid", gap: 1 }}>
            <strong style={{ fontFamily: display, fontSize: 16, letterSpacing: "-0.01em" }}>
              HandoffBase
            </strong>
            <small style={{ ...uppercaseLabel, fontSize: 10, letterSpacing: "0.08em" }}>
              memory vault
            </small>
          </span>
        </div>

        <nav style={{ display: "grid", gap: 4 }} aria-label="Views">
          {navItems.map((item) => {
            const active = item.key === view;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setView(item.key)}
                className={active ? undefined : "hb-hover-tint"}
                style={{
                  minHeight: 40,
                  border: active
                    ? "1px solid color-mix(in srgb, var(--accent) 35%, transparent)"
                    : "1px solid transparent",
                  borderRadius: 9,
                  background: active
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : "transparent",
                  color: active ? "var(--text)" : "var(--muted)",
                  fontWeight: active ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 12px",
                  width: "100%",
                  textAlign: "left"
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  {item.icon}
                  {item.label}
                </span>
                {item.count === null ? null : (
                  <span
                    style={
                      item.hot
                        ? {
                            fontFamily: mono,
                            fontSize: 11,
                            background: "var(--accent)",
                            color: "var(--accent-ink)",
                            borderRadius: 999,
                            padding: "1px 7px",
                            fontWeight: 600
                          }
                        : { fontFamily: mono, fontSize: 11, color: "var(--subtle)" }
                    }
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={() => setShowConnect(true)}
            className="hb-hover-solid"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minHeight: 36,
              border: "1px dashed color-mix(in srgb, var(--accent) 55%, transparent)",
              borderRadius: 9,
              background: "color-mix(in srgb, var(--accent) 6%, transparent)",
              color: "var(--chip)",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            <Plug size={14} aria-hidden />
            Connect an agent
          </button>
          <RuntimeStatusBlock mode={runtimeMode} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--muted)",
              fontSize: 12,
              fontFamily: mono
            }}
          >
            <ShieldCheck size={13} aria-hidden style={{ color: "var(--good)" }} />
            {tenantId} / {userId}
          </div>
        </div>
      </aside>

      {/* ================= MAIN ================= */}
      <section
        style={{
          minWidth: 0,
          padding: "24px 28px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 18
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "grid", gap: 3 }}>
            <span
              style={{
                fontFamily: mono,
                fontSize: 11,
                color: "var(--accent)",
                letterSpacing: "0.1em",
                textTransform: "uppercase"
              }}
            >
              {headings[view][0]}
            </span>
            <h1
              style={{
                margin: 0,
                fontFamily: display,
                fontSize: 25,
                fontWeight: 600,
                letterSpacing: "-0.015em"
              }}
            >
              {headings[view][1]}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 12, color: "var(--subtle)" }}>
              last sync {relativeTime(lastSyncedAt)}
            </span>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={isLoading}
              aria-busy={isLoading}
              title="Refresh"
              className="hb-hover-accent"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 9,
                background: "transparent",
                color: "var(--muted)",
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center"
              }}
            >
              <RefreshCcw size={15} aria-hidden className={isLoading ? "hb-spin" : undefined} />
            </button>
            {session.authMode === "api_key" ? (
              <button
                type="button"
                onClick={() => void logout()}
                title="Sign out"
                className="hb-hover-accent"
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 9,
                  background: "transparent",
                  color: "var(--muted)",
                  width: 32,
                  height: 32,
                  display: "grid",
                  placeItems: "center"
                }}
              >
                <LogOut size={15} aria-hidden />
              </button>
            ) : null}
            <div
              role="group"
              aria-label="Theme"
              style={{
                display: "flex",
                border: "1px solid var(--line)",
                borderRadius: 9,
                overflow: "hidden"
              }}
            >
              <ThemeSegButton
                active={theme === "dark"}
                title="Dark — Amber Archive"
                onClick={() => setTheme("dark")}
              >
                <Moon size={14} aria-hidden />
              </ThemeSegButton>
              <ThemeSegButton
                active={theme === "light"}
                title="Light — Paper Ledger"
                onClick={() => setTheme("light")}
              >
                <Sun size={14} aria-hidden />
              </ThemeSegButton>
            </div>
          </div>
        </header>

        {loadError ? <ErrorState error={loadError} onRetry={() => void loadDashboard()} /> : null}
        {mutationError ? (
          <MutationErrorState error={mutationError} onDismiss={() => setMutationError(null)} />
        ) : null}
        {isMutating ? (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              background: "color-mix(in srgb, var(--accent) 6%, transparent)",
              borderRadius: 10,
              padding: "10px 12px",
              color: "var(--chip)",
              fontSize: 12.5
            }}
          >
            <Clock3 size={15} aria-hidden />
            Applying memory change to the active store…
          </div>
        ) : null}

        {snapshot ? (
          <>
            {view === "overview" ? (
              <OverviewView
                snapshot={snapshot}
                pending={pendingMemories}
                stats={stats}
                hostCount={new Set(snapshot.traces.map((t) => t.hostId)).size}
                onGoto={setView}
                onApprove={approve}
                onReject={reject}
                onSelectTrace={(id) => {
                  setSelectedTraceId(id);
                  setView("traces");
                }}
              />
            ) : null}

            {view === "vault" ? (
              <VaultView
                memories={filteredMemories}
                hasStored={snapshot.memories.length > 0}
                selectedMemory={selectedMemory}
                selectedEvents={selectedEvents}
                editState={editState}
                setEditState={setEditState}
                query={query}
                setQuery={setQuery}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                hostFilter={hostFilter}
                setHostFilter={setHostFilter}
                hostOptions={hostOptions}
                userId={userId}
                tenantId={tenantId}
                deleteConfirm={deleteConfirm}
                setDeleteConfirm={setDeleteConfirm}
                isMutating={isMutating}
                copiedKey={copiedKey}
                onCopy={copyText}
                onSelect={(id) => selectMemory(id, false)}
                onOpenSuperseder={(id) => selectMemory(id, false)}
                onSave={saveEdit}
                onApprove={() => selectedMemory && approve(selectedMemory.id)}
                onInvalidate={() => selectedMemory && invalidate(selectedMemory.id)}
                onDelete={() => selectedMemory && remove(selectedMemory.id)}
              />
            ) : null}

            {view === "review" ? (
              <ReviewView
                pending={pendingMemories}
                conflicts={snapshot.conflicts}
                isMutating={isMutating}
                onApprove={approve}
                onReject={reject}
                onInspect={(id) => selectMemory(id, true)}
                onResolve={resolveConflict}
              />
            ) : null}

            {view === "traces" ? (
              <TracesView
                traces={snapshot.traces}
                feedback={snapshot.feedback}
                selectedTrace={selectedTrace}
                selectedTraceId={selectedTraceId}
                setSelectedTraceId={setSelectedTraceId}
                isMutating={isMutating}
                onSelectMemory={(id) => selectMemory(id, true)}
                onSubmitFeedback={submitFeedback}
              />
            ) : null}

            {view === "audit" ? (
              <AuditView
                events={snapshot.events}
                onOpen={(id) => selectMemory(id, true)}
              />
            ) : null}
          </>
        ) : null}
      </section>

      {showConnect ? (
        <ConnectModal
          host={connectHost}
          setHost={setConnectHost}
          copiedKey={copiedKey}
          onCopy={copyText}
          onClose={() => setShowConnect(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell primitives
// ---------------------------------------------------------------------------

function ThemedShell({ theme, children }: { theme: ThemeKey; children: ReactNode }) {
  return (
    <div
      data-theme={theme}
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-ui)"
      }}
    >
      {children}
    </div>
  );
}

function ThemeSegButton({
  active,
  title,
  onClick,
  children
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        border: 0,
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent-ink)" : "var(--subtle)",
        fontWeight: active ? 600 : 400,
        minHeight: 30,
        padding: "0 11px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12
      }}
    >
      {children}
    </button>
  );
}

function RuntimeStatusBlock({ mode }: { mode?: DashboardRuntimeMode }) {
  const copy = mode
    ? dashboardRuntimeCopy[mode]
    : { label: "Server API", detail: "Connecting to the same-origin dashboard API." };
  const dot =
    mode === "shared_persistent_store"
      ? "var(--good)"
      : mode === "server_in_memory"
        ? "var(--warn)"
        : mode === "mock_demo"
          ? "var(--subtle)"
          : "var(--muted)";
  const sub =
    mode === "shared_persistent_store"
      ? "postgres · pgvector · shared store"
      : mode === "server_in_memory"
        ? "server memory · same-origin api"
        : mode === "mock_demo"
          ? "browser demo · resets on reload"
          : "same-origin dashboard api";
  return (
    <div
      role="status"
      data-mode={mode ?? "connecting"}
      style={{
        border: "1px solid var(--line2)",
        borderRadius: 10,
        background: "var(--panel)",
        padding: 11,
        display: "grid",
        gap: 5
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: dot,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${dot} 18%, transparent)`
          }}
        />
        {copy.label}
      </span>
      <small style={{ color: "var(--subtle)", fontFamily: mono, fontSize: 10.5 }}>{sub}</small>
    </div>
  );
}

function DashboardLoading({ title }: { title: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "var(--font-ui)"
      }}
    >
      <div
        style={{
          ...panel({ padding: "22px 24px" }),
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "var(--shadow)"
        }}
      >
        <Clock3 size={22} aria-hidden style={{ color: "var(--accent)" }} className="hb-spin" />
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontFamily: display, fontSize: 17, fontWeight: 600 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Preparing caller-scoped memory records, trace runs, and review queues.
          </p>
        </div>
      </div>
    </main>
  );
}

function LoginGate({
  apiKey,
  error,
  isLoggingIn,
  setApiKey,
  onLogin,
  onRetry
}: {
  apiKey: string;
  error: LoadError | null;
  isLoggingIn: boolean;
  setApiKey: (value: string) => void;
  onLogin: () => void;
  onRetry: () => void;
}) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section
        aria-labelledby="dashboard-sign-in-title"
        style={{
          ...panel({ padding: "26px 26px" }),
          width: "min(420px, 100%)",
          boxShadow: "var(--shadow)",
          display: "grid",
          gap: 14
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            color: "var(--accent)",
            display: "grid",
            placeItems: "center"
          }}
        >
          <ShieldCheck size={24} aria-hidden />
        </span>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={uppercaseLabel}>HandoffBase Memory Vault</span>
          <h1 id="dashboard-sign-in-title" style={{ margin: 0, fontFamily: display, fontSize: 21, fontWeight: 600 }}>
            Sign in to your memory scope
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
            Your API key is exchanged for a signed, HttpOnly session cookie. It is never stored in
            browser storage or returned to the client.
          </p>
        </div>
        {error ? (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "1px solid color-mix(in srgb, var(--bad) 45%, transparent)",
              background: "color-mix(in srgb, var(--bad) 8%, transparent)",
              color: "var(--bad)",
              borderRadius: 9,
              padding: "10px 12px",
              fontSize: 12.5
            }}
          >
            <TriangleAlert size={16} aria-hidden />
            <span>{error.message}</span>
          </div>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin();
          }}
          style={{ display: "grid", gap: 12 }}
        >
          <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12 }}>
            <span style={uppercaseLabel}>HandoffBase API key</span>
            <input
              className="hb-input"
              autoComplete="current-password"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Enter API key"
              required
              style={{
                minHeight: 40,
                border: "1px solid var(--line)",
                borderRadius: 9,
                background: "var(--inset)",
                color: "var(--text)",
                outline: "none",
                padding: "0 12px",
                fontSize: 13.5,
                boxSizing: "border-box"
              }}
            />
          </label>
          <button
            className="hb-hover-bright"
            type="submit"
            disabled={isLoggingIn || !apiKey.trim()}
            style={{ ...primaryBtn, justifyContent: "center", minHeight: 40 }}
          >
            <ShieldCheck size={16} aria-hidden />
            {isLoggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error?.kind === "configuration" ? (
          <button
            type="button"
            onClick={onRetry}
            className="hb-hover-accent"
            style={{ ...ghostBtn, justifyContent: "center" }}
          >
            <RefreshCcw size={15} aria-hidden />
            Recheck server configuration
          </button>
        ) : null}
      </section>
    </main>
  );
}

function EmptyState({
  icon,
  title,
  body,
  minHeight = 200
}: {
  icon: ReactNode;
  title: string;
  body: string;
  minHeight?: number;
}) {
  return (
    <div
      style={{
        minHeight,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--muted)",
        textAlign: "center",
        padding: 24
      }}
    >
      <span style={{ color: "var(--subtle)" }}>{icon}</span>
      <strong>{title}</strong>
      <p style={{ margin: 0, fontSize: 13, color: "var(--subtle)" }}>{body}</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  const isConfig = error.kind === "configuration";
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        border: "1px solid color-mix(in srgb, var(--bad) 45%, transparent)",
        background: "color-mix(in srgb, var(--bad) 7%, transparent)",
        borderRadius: 11,
        padding: 14,
        color: "var(--body)"
      }}
    >
      <TriangleAlert size={22} aria-hidden style={{ color: "var(--bad)", flex: "0 0 auto" }} />
      <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
        <strong style={{ fontFamily: display, fontSize: 14 }}>
          {isConfig ? "Dashboard configuration required" : "Dashboard failed to load"}
        </strong>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{error.message}</p>
        {isConfig ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--subtle)" }}>
            Configure the memory store on the server, then retry this same-origin API request.
          </p>
        ) : null}
      </div>
      <button type="button" onClick={onRetry} className="hb-hover-accent" style={ghostBtn}>
        <RefreshCcw size={15} aria-hidden />
        Retry
      </button>
    </div>
  );
}

function MutationErrorState({
  error,
  onDismiss
}: {
  error: MutationError;
  onDismiss: () => void;
}) {
  const refreshFailed = error.kind === "refresh";
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        border: "1px solid color-mix(in srgb, var(--warn) 45%, transparent)",
        background: "color-mix(in srgb, var(--warn) 7%, transparent)",
        borderRadius: 11,
        padding: 14,
        color: "var(--body)"
      }}
    >
      <TriangleAlert size={22} aria-hidden style={{ color: "var(--warn)", flex: "0 0 auto" }} />
      <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
        <strong style={{ fontFamily: display, fontSize: 14 }}>
          {refreshFailed ? "Memory changed; refresh failed" : "Memory change failed"}
        </strong>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{error.message}</p>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--subtle)" }}>
          {refreshFailed
            ? "The server accepted the change. Refresh to confirm its latest stored state."
            : "The last successfully loaded dashboard state is still shown below."}
        </p>
      </div>
      <button type="button" onClick={onDismiss} className="hb-hover-accent" style={ghostBtn}>
        Dismiss
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function overviewTitle(snapshot: DashboardSnapshot | null): string {
  const hosts = new Set((snapshot?.traces ?? []).map((trace) => trace.hostId)).size;
  if (hosts <= 1) {
    return "Your memory, carried across every agent";
  }
  return `Your memory survived ${hosts} agents`;
}

function heroChip(trace: MemoryTrace): { label: string; tone: string } {
  const mode = String(trace.metadata?.recall_mode ?? "");
  const used = trace.usedMemories.length;
  if (mode.includes("bootstrap")) {
    return { label: `↓ bootstrap · ${used} memories`, tone: "var(--chip)" };
  }
  if (mode.includes("reflect")) {
    return { label: `✎ reflected · ${used} used`, tone: "var(--chip)" };
  }
  return { label: `✓ recalled ×${used}`, tone: "var(--good)" };
}

function OverviewView({
  snapshot,
  pending,
  stats,
  hostCount,
  onGoto,
  onApprove,
  onReject,
  onSelectTrace
}: {
  snapshot: DashboardSnapshot;
  pending: MemoryRecord[];
  stats: { total: number; active: number; pending: number; conflicts: number; traces: number; review: number };
  hostCount: number;
  onGoto: (view: ViewKey) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectTrace: (id: string) => void;
}) {
  const chrono = [...snapshot.traces].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
  const heroSteps = chrono.slice(-3);
  const carried = heroSteps.reduce((sum, step) => sum + step.usedMemories.length, 0);
  const heroHosts = new Set(heroSteps.map((step) => step.hostId)).size;
  const latest = snapshot.traces[0];
  const latestWhy = latest?.usedMemories[0]
    ? `${token(latest.usedMemories[0].type)}${
        latest.usedMemories[0].score !== undefined
          ? ` (score ${pct(latest.usedMemories[0].score)})`
          : ""
      } — ${latest.usedMemories[0].reason}`
    : "No recall reasons recorded for the latest run yet.";

  const metrics: Array<{
    label: string;
    value: number;
    note: string;
    noteTone: string;
    valueTone?: string;
    hot?: boolean;
    view: ViewKey;
  }> = [
    {
      label: "Active memories",
      value: stats.active,
      note: `${stats.total} in vault`,
      noteTone: "var(--good)",
      view: "vault"
    },
    {
      label: "Pending review",
      value: stats.pending,
      note: stats.pending ? "review to activate" : "queue clear",
      noteTone: "var(--subtle)",
      valueTone: stats.pending ? "var(--chip)" : undefined,
      hot: stats.pending > 0,
      view: "review"
    },
    {
      label: "Open conflicts",
      value: stats.conflicts,
      note: stats.conflicts ? "needs a decision" : "all clear",
      noteTone: "var(--subtle)",
      valueTone: stats.conflicts ? "var(--bad)" : undefined,
      view: "review"
    },
    {
      label: "Trace runs",
      value: stats.traces,
      note: `across ${hostCount} host${hostCount === 1 ? "" : "s"}`,
      noteTone: "var(--subtle)",
      view: "traces"
    }
  ];

  return (
    <div data-screen-label="Overview" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* continuity hero */}
      {heroSteps.length ? (
        <div
          style={{
            ...panel({ background: "var(--hero-grad)" }),
            boxShadow: "var(--shadow)",
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <strong style={{ fontFamily: display, fontSize: 15 }}>
              Cross-agent handoff — {fmtDay(heroSteps[0].createdAt)} →{" "}
              {fmtDay(heroSteps[heroSteps.length - 1].createdAt)}
            </strong>
            <span style={monoSubtle}>
              {carried} memories carried across {heroHosts} host{heroHosts === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "wrap" }}>
            {heroSteps.map((step, index) => {
              const chip = heroChip(step);
              return (
                <div
                  key={step.id}
                  style={{ display: "flex", alignItems: "stretch", flex: "1 1 200px", minWidth: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTrace(step.id)}
                    className="hb-hover-accent"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      background: "var(--inset)",
                      padding: 14,
                      display: "grid",
                      gap: 8,
                      textAlign: "left",
                      alignContent: "start"
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8
                      }}
                    >
                      <strong style={{ fontFamily: mono, fontSize: 13, minWidth: 0 }}>{step.hostId}</strong>
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 11,
                          color: "var(--subtle)",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {fmt(step.createdAt)}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--muted)",
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden"
                      }}
                    >
                      {step.query}
                    </span>
                    <span style={{ ...chipStyle(chip.tone), justifySelf: "start" }}>{chip.label}</span>
                  </button>
                  {index < heroSteps.length - 1 ? (
                    <div
                      style={{
                        display: "grid",
                        placeItems: "center",
                        color: "var(--accent)",
                        width: 44,
                        flex: "0 0 auto"
                      }}
                    >
                      <ArrowRight size={20} aria-hidden />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* metrics */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}
        aria-label="Memory health"
      >
        {metrics.map((metric) => (
          <button
            key={metric.label}
            type="button"
            onClick={() => onGoto(metric.view)}
            className="hb-hover-accent"
            style={{
              ...panel(
                metric.hot
                  ? {
                      border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
                      background: "color-mix(in srgb, var(--accent) 6%, transparent)"
                    }
                  : undefined
              ),
              padding: 14,
              display: "grid",
              gap: 5,
              textAlign: "left",
              alignContent: "start"
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{metric.label}</span>
            <strong
              style={{
                fontSize: 29,
                fontWeight: 600,
                fontFamily: mono,
                lineHeight: 1.1,
                color: metric.valueTone
              }}
            >
              {metric.value}
            </strong>
            <small style={{ fontFamily: mono, fontSize: 11, color: metric.noteTone }}>{metric.note}</small>
          </button>
        ))}
      </div>

      {/* two column */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
        <div style={{ ...panel({ padding: 16 }), display: "grid", gap: 12, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontFamily: display, fontSize: 15 }}>Review queue</strong>
            <button
              type="button"
              onClick={() => onGoto("review")}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                fontFamily: mono,
                fontSize: 11,
                color: "var(--accent)"
              }}
            >
              {stats.review} waiting →
            </button>
          </div>
          {pending.slice(0, 2).map((memory) => (
            <div
              key={memory.id}
              style={{
                border: "1px solid var(--line2)",
                borderRadius: 10,
                background: "var(--inset)",
                padding: 12,
                display: "grid",
                gap: 8
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={typeTagStyle}>{memory.type}</span>
                <small style={monoSubtle}>
                  {(memory.scope.hostId ?? "server") + " · " + fmt(memory.createdAt)}
                </small>
              </span>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--body)" }}>
                {memory.canonicalText}
              </p>
              <span style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onApprove(memory.id)}
                  className="hb-hover-bright"
                  style={{ ...primaryBtn, minHeight: 30, padding: "0 12px" }}
                >
                  <Check size={13} aria-hidden strokeWidth={2.5} />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onReject(memory.id)}
                  className="hb-hover-bad"
                  style={{ ...ghostBtn, minHeight: 30, padding: "0 12px" }}
                >
                  <X size={13} aria-hidden strokeWidth={2.5} />
                  Reject
                </button>
              </span>
            </div>
          ))}
          {pending.length === 0 ? (
            <p style={{ margin: 0, color: "var(--subtle)", fontSize: 13 }}>
              Queue is clear. New extractions will wait here for approval.
            </p>
          ) : null}
        </div>

        <div style={{ ...panel({ padding: 16 }), display: "grid", gap: 12, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontFamily: display, fontSize: 15 }}>Latest trace</strong>
            <span style={monoSubtle}>{latest?.id ?? "—"}</span>
          </div>
          {latest ? (
            <>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--body)" }}>
                “{latest.query}”
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={chipStyle("var(--good)")}>● {latest.usedMemories.length} used</span>
                <span style={chipStyle("var(--warn)")}>● {latest.ignoredMemories.length} ignored</span>
                <span style={chipStyle("var(--bad)")}>● {latest.excludedMemories.length} excluded</span>
              </div>
              <div style={{ borderLeft: "2px solid var(--accent)", padding: "2px 0 2px 12px", display: "grid", gap: 4 }}>
                <small style={uppercaseLabel}>why it was used</small>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{latestWhy}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelectTrace(latest.id)}
                className="hb-hover-accent"
                style={{ ...ghostBtn, justifySelf: "start", minHeight: 30 }}
              >
                Open trace viewer
                <ArrowRight size={13} aria-hidden />
              </button>
            </>
          ) : (
            <p style={{ margin: 0, color: "var(--subtle)", fontSize: 13 }}>
              No trace runs recorded yet. Recall and bootstrap calls will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

function VaultView({
  memories,
  hasStored,
  selectedMemory,
  selectedEvents,
  editState,
  setEditState,
  query,
  setQuery,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  hostFilter,
  setHostFilter,
  hostOptions,
  userId,
  tenantId,
  deleteConfirm,
  setDeleteConfirm,
  isMutating,
  copiedKey,
  onCopy,
  onSelect,
  onOpenSuperseder,
  onSave,
  onApprove,
  onInvalidate,
  onDelete
}: {
  memories: MemoryRecord[];
  hasStored: boolean;
  selectedMemory?: MemoryRecord;
  selectedEvents: MemoryEvent[];
  editState: EditState | null;
  setEditState: (value: EditState | null) => void;
  query: string;
  setQuery: (value: string) => void;
  typeFilter: "all" | MemoryType;
  setTypeFilter: (value: "all" | MemoryType) => void;
  statusFilter: "all" | MemoryStatus;
  setStatusFilter: (value: "all" | MemoryStatus) => void;
  hostFilter: string;
  setHostFilter: (value: string) => void;
  hostOptions: string[];
  userId: string;
  tenantId: string;
  deleteConfirm: boolean;
  setDeleteConfirm: (value: boolean) => void;
  isMutating: boolean;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  onSelect: (id: string) => void;
  onOpenSuperseder: (id: string) => void;
  onSave: () => void;
  onApprove: () => void;
  onInvalidate: () => void;
  onDelete: () => void;
}) {
  const thStyle: CSSProperties = {
    borderBottom: "1px solid var(--line)",
    padding: "9px 10px",
    textAlign: "left",
    fontSize: 11,
    color: "var(--subtle)",
    fontWeight: 600,
    fontFamily: mono,
    letterSpacing: "0.07em",
    textTransform: "uppercase"
  };
  const tdStyle: CSSProperties = {
    borderBottom: "1px solid var(--line2)",
    padding: "11px 10px",
    verticalAlign: "top"
  };

  return (
    <div
      data-screen-label="Memory Vault"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1.5fr) minmax(370px,0.9fr)",
        gap: 14,
        alignItems: "start"
      }}
    >
      <section aria-label="Memory list" style={{ ...panel({ padding: 16 }), minWidth: 0, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
          <label
            className="hb-field"
            style={{
              flex: "1 1 280px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid var(--line)",
              borderRadius: 9,
              background: "var(--inset)",
              padding: "0 10px",
              color: "var(--subtle)"
            }}
          >
            <Search size={15} aria-hidden />
            <span className="sr-only">Search memories</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memories, sources, scopes…"
              style={{
                minHeight: 38,
                border: 0,
                background: "transparent",
                padding: 0,
                color: "var(--text)",
                outline: "none",
                width: "100%",
                fontSize: 13.5
              }}
            />
          </label>
          <select
            className="hb-input"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as "all" | MemoryType)}
            aria-label="Filter by type"
            style={selectStyle}
          >
            <option value="all">Type: all</option>
            {memoryTypes.map((type) => (
              <option key={type} value={type}>
                {token(type)}
              </option>
            ))}
          </select>
          <select
            className="hb-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | MemoryStatus)}
            aria-label="Filter by status"
            style={selectStyle}
          >
            <option value="all">Status: all</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {token(status)}
              </option>
            ))}
          </select>
          <select
            className="hb-input"
            value={hostFilter}
            onChange={(event) => setHostFilter(event.target.value)}
            aria-label="Filter by host"
            style={selectStyle}
          >
            <option value="all">Host: all</option>
            {hostOptions.map((host) => (
              <option key={host} value={host}>
                {host}
              </option>
            ))}
          </select>
        </div>

        {memories.length ? (
          <div className="hb-scroll" style={{ overflow: "auto", margin: "0 -16px -16px", padding: "0 16px 16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, paddingLeft: 0 }}>Memory</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Scope</th>
                  <th style={{ ...thStyle, textAlign: "right", paddingRight: 0 }}>Conf · Imp</th>
                </tr>
              </thead>
              <tbody>
                {memories.map((memory) => {
                  const selected = memory.id === selectedMemory?.id;
                  return (
                    <tr
                      key={memory.id}
                      className="hb-row"
                      style={selected ? { background: "color-mix(in srgb, var(--accent) 7%, transparent)" } : undefined}
                    >
                      <td style={{ ...tdStyle, paddingLeft: 0 }}>
                        <button
                          type="button"
                          onClick={() => onSelect(memory.id)}
                          style={{
                            width: "100%",
                            border: 0,
                            background: "transparent",
                            padding: 0,
                            textAlign: "left",
                            display: "grid",
                            gap: 4
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13.5,
                              lineHeight: 1.45,
                              color: "var(--body)",
                              maxWidth: 520,
                              display: "-webkit-box",
                              overflow: "hidden",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical"
                            }}
                          >
                            {memory.canonicalText}
                          </span>
                          <small style={{ color: "var(--subtle)", fontFamily: mono, fontSize: 10.5 }}>
                            {memory.id} · {fmt(memory.updatedAt)}
                          </small>
                        </button>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={typeTagStyle}>{memory.type}</span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={badgeStyle(memory.status)}>{token(memory.status)}</span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "var(--muted)", fontFamily: mono }}>
                        {scopeShort(memory)}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          paddingRight: 0,
                          textAlign: "right",
                          fontFamily: mono,
                          fontSize: 12,
                          color: "var(--muted)",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {pct(memory.confidence)} · {pct(memory.importance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Inbox size={22} aria-hidden />}
            title={hasStored ? "No memories match these filters" : "No memories in this store"}
            body={
              hasStored
                ? "Clear search or broaden the type, status, or host filter."
                : "The connected store is ready for the first scoped memory write."
            }
          />
        )}
      </section>

      <MemoryDetailPanel
        memory={selectedMemory}
        events={selectedEvents}
        editState={editState}
        setEditState={setEditState}
        userId={userId}
        tenantId={tenantId}
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
        isMutating={isMutating}
        copiedKey={copiedKey}
        onCopy={onCopy}
        onOpenSuperseder={onOpenSuperseder}
        onSave={onSave}
        onApprove={onApprove}
        onInvalidate={onInvalidate}
        onDelete={onDelete}
      />
    </div>
  );
}

function MemoryDetailPanel({
  memory,
  events,
  editState,
  setEditState,
  userId,
  tenantId,
  deleteConfirm,
  setDeleteConfirm,
  isMutating,
  copiedKey,
  onCopy,
  onOpenSuperseder,
  onSave,
  onApprove,
  onInvalidate,
  onDelete
}: {
  memory?: MemoryRecord;
  events: MemoryEvent[];
  editState: EditState | null;
  setEditState: (value: EditState | null) => void;
  userId: string;
  tenantId: string;
  deleteConfirm: boolean;
  setDeleteConfirm: (value: boolean) => void;
  isMutating: boolean;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  onOpenSuperseder: (id: string) => void;
  onSave: () => void;
  onApprove: () => void;
  onInvalidate: () => void;
  onDelete: () => void;
}) {
  const sectionStyle: CSSProperties = {
    ...panel({ padding: 18 }),
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    position: "sticky",
    top: 16
  };

  if (!memory || !editState) {
    return (
      <section aria-label="Memory detail" style={sectionStyle}>
        <EmptyState
          icon={<Eye size={22} aria-hidden />}
          title="Select a memory"
          body="Inspect provenance, edit, and manage its lifecycle."
          minHeight={220}
        />
      </section>
    );
  }

  const resourceUri = resourceUriFor(memory, userId);
  const scopeText = [tenantId, userId, memory.scope.projectId, memory.scope.hostId, memory.scope.toolId]
    .filter(Boolean)
    .join(" / ");
  const validity = memory.validity.validUntil
    ? `${fmt(memory.validity.validFrom)} → ${fmt(memory.validity.validUntil)}`
    : `from ${fmt(memory.validity.validFrom)}`;

  function patch(next: Partial<EditState>) {
    if (editState) {
      setEditState({ ...editState, ...next });
    }
  }

  const metaCell = (label: string, value: string, extra?: CSSProperties): ReactNode => (
    <div style={{ border: "1px solid var(--line2)", borderRadius: 9, padding: 9, minWidth: 0, background: "var(--inset)" }}>
      <dt style={{ ...uppercaseLabel, marginBottom: 3 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 12.5, overflowWrap: "anywhere", color: "var(--body)", ...extra }}>{value}</dd>
    </div>
  );

  return (
    <section aria-label="Memory detail" style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: "var(--subtle)", overflowWrap: "anywhere" }}>
          {memory.id}
        </span>
        <span style={badgeStyle(memory.status)}>{token(memory.status)}</span>
      </div>

      {memory.supersededBy ? (
        <button
          type="button"
          onClick={() => onOpenSuperseder(memory.supersededBy as string)}
          className="hb-hover-info"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid color-mix(in srgb, var(--info) 45%, transparent)",
            background: "color-mix(in srgb, var(--info) 7%, transparent)",
            borderRadius: 9,
            padding: "8px 10px",
            color: "var(--info)",
            fontSize: 12,
            textAlign: "left"
          }}
        >
          <ArrowRight size={13} aria-hidden />
          <span>
            Superseded by <span style={{ fontFamily: mono }}>{memory.supersededBy}</span> — open the
            replacement
          </span>
        </button>
      ) : null}

      <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12 }}>
        <span style={uppercaseLabel}>Canonical memory</span>
        <textarea
          className="hb-input"
          rows={4}
          value={editState.canonicalText}
          onChange={(event) => patch({ canonicalText: event.target.value })}
          style={{
            width: "100%",
            border: "1px solid var(--line)",
            borderRadius: 9,
            background: "var(--inset)",
            color: "var(--body)",
            outline: "none",
            resize: "vertical",
            padding: 10,
            fontSize: 13.5,
            lineHeight: 1.5,
            boxSizing: "border-box"
          }}
        />
      </label>

      {memory.rawSource ? (
        <div style={{ borderLeft: "2px solid var(--line)", padding: "2px 0 2px 12px", display: "grid", gap: 4 }}>
          <small style={uppercaseLabel}>raw source</small>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{memory.rawSource}</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12 }}>
          <span style={uppercaseLabel}>Confidence · {pct(editState.confidence)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={editState.confidence}
            onChange={(event) => patch({ confidence: Number(event.target.value) })}
            style={{ width: "100%", margin: 0 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12 }}>
          <span style={uppercaseLabel}>Importance · {pct(editState.importance)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={editState.importance}
            onChange={(event) => patch({ importance: Number(event.target.value) })}
            style={{ width: "100%", margin: 0 }}
          />
        </label>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: 0 }}>
        {metaCell("Source", `${token(memory.source.kind)} — ${memory.source.label}`)}
        {metaCell("Scope", scopeText, { fontFamily: mono })}
        {metaCell("Valid", validity)}
        {metaCell("Last used", memory.lastUsedAt ? fmt(memory.lastUsedAt) : "never used")}
      </dl>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          border: "1px solid var(--line2)",
          borderRadius: 9,
          background: "var(--inset)",
          padding: "8px 10px"
        }}
      >
        <span style={{ fontFamily: mono, fontSize: 11, color: "var(--muted)", overflowWrap: "anywhere" }}>
          {resourceUri}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
          <small style={{ fontFamily: mono, fontSize: 10.5, color: "var(--subtle)" }}>
            recalled {memory.useCount}×
          </small>
          <button
            type="button"
            onClick={() => onCopy("uri", resourceUri)}
            style={{ border: 0, background: "transparent", padding: 0, fontFamily: mono, fontSize: 10.5, color: "var(--accent)" }}
          >
            {copiedKey === "uri" ? "copied ✓" : "copy"}
          </button>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={isMutating}
          className="hb-hover-bright"
          style={primaryBtn}
        >
          <Save size={13} aria-hidden strokeWidth={2.5} />
          Save
        </button>
        {memory.status === "pending" ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={isMutating}
            className="hb-hover-bright"
            style={{
              ...ghostBtn,
              border: "1px solid color-mix(in srgb, var(--good) 50%, transparent)",
              background: "color-mix(in srgb, var(--good) 9%, transparent)",
              color: "var(--good)",
              fontWeight: 600
            }}
          >
            <Check size={13} aria-hidden strokeWidth={2.5} />
            Approve
          </button>
        ) : null}
        <button
          type="button"
          onClick={onInvalidate}
          disabled={isMutating}
          className="hb-hover-warn"
          style={ghostBtn}
        >
          <Ban size={13} aria-hidden />
          Invalidate
        </button>
        <button
          type="button"
          onClick={() => setDeleteConfirm(true)}
          disabled={isMutating}
          className="hb-hover-bad"
          style={ghostBtn}
        >
          <Trash2 size={13} aria-hidden />
          Delete
        </button>
      </div>

      {deleteConfirm ? (
        <div
          style={{
            border: "1px solid color-mix(in srgb, var(--bad) 50%, transparent)",
            borderRadius: 9,
            background: "color-mix(in srgb, var(--bad) 7%, transparent)",
            padding: 11,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 12.5
          }}
        >
          <TriangleAlert size={15} aria-hidden style={{ color: "var(--bad)" }} />
          <span style={{ color: "var(--body)" }}>Hard delete leaves only a tombstone in the audit log.</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={isMutating}
            style={{ minHeight: 28, padding: "0 11px", borderRadius: 7, border: 0, background: "var(--bad)", color: "#fff", fontWeight: 600, fontSize: 12 }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirm(false)}
            style={{ ...ghostBtn, minHeight: 28, padding: "0 11px", borderRadius: 7, fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 2, borderTop: "1px solid var(--line2)", paddingTop: 12 }}>
        <span style={{ ...uppercaseLabel, marginBottom: 6 }}>Lifecycle</span>
        {events.length ? (
          events.map((event, index) => (
            <div key={event.id} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr)", gap: 10, padding: "5px 0" }}>
              <span style={{ display: "grid", justifyItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: eventToneVar(event.eventType), marginTop: 4 }} />
                {index < events.length - 1 ? (
                  <span style={{ width: 1, flex: 1, minHeight: 18, background: "var(--line)" }} />
                ) : null}
              </span>
              <span style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 12.5 }}>{token(event.eventType)}</strong>
                  <small style={{ fontFamily: mono, color: "var(--subtle)", fontSize: 10.5, whiteSpace: "nowrap" }}>
                    {fmt(event.createdAt)}
                  </small>
                </span>
                <small style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.45 }}>{event.reason}</small>
                <small style={{ color: "var(--subtle)", fontFamily: mono, fontSize: 10.5 }}>
                  {event.actorType}:{event.actorId}
                </small>
              </span>
            </div>
          ))
        ) : (
          <small style={{ color: "var(--subtle)", fontSize: 12 }}>No lifecycle events recorded yet.</small>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Review (pending candidates + conflicts)
// ---------------------------------------------------------------------------

function ReviewView({
  pending,
  conflicts,
  isMutating,
  onApprove,
  onReject,
  onInspect,
  onResolve
}: {
  pending: MemoryRecord[];
  conflicts: ConflictCandidate[];
  isMutating: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onInspect: (id: string) => void;
  onResolve: (conflictId: string, input: ConflictResolutionInput) => void;
}) {
  return (
    <div data-screen-label="Review Queue" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section aria-label="Pending candidates" style={{ ...panel({ padding: 16 }), display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <strong style={{ fontFamily: display, fontSize: 15 }}>Pending candidates</strong>
          <span style={monoSubtle}>
            {pending.length} candidates · extracted by Qwen, waiting for your approval
          </span>
        </div>
        {pending.map((memory) => (
          <article
            key={memory.id}
            style={{
              border: "1px solid var(--line2)",
              borderRadius: 11,
              background: "var(--inset)",
              padding: 14,
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: 16
            }}
          >
            <div style={{ display: "grid", gap: 9, minWidth: 0, alignContent: "start" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={typeTagStyle}>{memory.type}</span>
                <small style={monoSubtle}>
                  {(memory.scope.hostId ?? "server") + " · " + fmt(memory.createdAt)}
                </small>
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--body)" }}>{memory.canonicalText}</p>
              {memory.rawSource ? (
                <div style={{ borderLeft: "2px solid var(--line)", padding: "2px 0 2px 12px", display: "grid", gap: 3 }}>
                  <small style={uppercaseLabel}>extraction source</small>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{memory.rawSource}</p>
                </div>
              ) : null}
              <small style={monoSubtle}>
                confidence {pct(memory.confidence)} · importance {pct(memory.importance)} ·{" "}
                {memory.validity.reason ?? "pending reviewer decision"}
              </small>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => onApprove(memory.id)}
                disabled={isMutating}
                className="hb-hover-bright"
                style={{ ...primaryBtn, justifyContent: "center", padding: "0 14px" }}
              >
                <Check size={13} aria-hidden strokeWidth={2.5} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => onInspect(memory.id)}
                className="hb-hover-accent"
                style={{ ...ghostBtn, justifyContent: "center", padding: "0 14px" }}
              >
                <Eye size={13} aria-hidden />
                Inspect
              </button>
              <button
                type="button"
                onClick={() => onReject(memory.id)}
                disabled={isMutating}
                className="hb-hover-bad"
                style={{ ...ghostBtn, justifyContent: "center", padding: "0 14px" }}
              >
                <X size={13} aria-hidden strokeWidth={2.5} />
                Reject
              </button>
            </div>
          </article>
        ))}
        {pending.length === 0 ? (
          <EmptyState
            icon={<Inbox size={22} aria-hidden />}
            title="Queue is clear"
            body="New extractions and correction candidates will wait here."
            minHeight={140}
          />
        ) : null}
      </section>

      <section aria-label="Conflicts" style={{ ...panel({ padding: 16 }), display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <strong style={{ fontFamily: display, fontSize: 15 }}>Conflicts</strong>
          <span style={monoSubtle}>
            {conflicts.length} open · governed resolution with auditable reasons
          </span>
        </div>
        {conflicts.map((conflict) => (
          <ConflictCard
            key={conflict.id}
            conflict={conflict}
            isMutating={isMutating}
            onResolve={onResolve}
          />
        ))}
        {conflicts.length === 0 ? (
          <EmptyState
            icon={<Check size={22} aria-hidden />}
            title="No open conflicts"
            body="Supersede, merge, and reject candidates will surface here."
            minHeight={120}
          />
        ) : null}
      </section>
    </div>
  );
}

const conflictActionOptions: Array<{ action: ConflictResolutionAction; label: string }> = [
  { action: "accept_candidate", label: "Accept candidate" },
  { action: "reject_candidate", label: "Reject candidate" },
  { action: "supersede_existing", label: "Supersede existing" },
  { action: "merge", label: "Merge memories" },
  { action: "keep_both", label: "Keep both" },
  { action: "dismiss_conflict", label: "Dismiss conflict" }
];

export function ConflictCard({
  conflict,
  isMutating,
  onResolve
}: {
  conflict: ConflictCandidate;
  isMutating: boolean;
  onResolve: (conflictId: string, input: ConflictResolutionInput) => void;
}) {
  const [action, setAction] = useState<ConflictResolutionAction>(conflict.recommendedAction);
  const [reason, setReason] = useState("");
  const [mergedText, setMergedText] = useState(conflict.incoming);
  const isMerge = action === "merge";
  const canResolve = Boolean(reason.trim() && (!isMerge || mergedText.trim()));

  const formInput: CSSProperties = {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: "var(--panel)",
    color: "var(--text)",
    outline: "none",
    padding: "8px 10px",
    fontSize: 12.5,
    boxSizing: "border-box"
  };

  return (
    <article
      style={{
        border: "1px solid var(--line2)",
        borderRadius: 11,
        background: "var(--inset)",
        padding: 14,
        display: "grid",
        gap: 14
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={chipStyle("var(--bad)")}>
          {conflict.severity} · {token(conflict.conflictType)}
        </span>
        <span style={typeTagStyle}>{conflict.memoryType}</span>
        <small style={monoSubtle}>{conflict.scopeLabel}</small>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div
          style={{
            border: "1px solid color-mix(in srgb, var(--good) 35%, transparent)",
            borderRadius: 9,
            padding: 11,
            display: "grid",
            gap: 5,
            alignContent: "start"
          }}
        >
          <small style={{ ...uppercaseLabel, color: "var(--good)" }}>incoming candidate</small>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--body)" }}>{conflict.incoming}</p>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 11, display: "grid", gap: 5, alignContent: "start" }}>
          <small style={uppercaseLabel}>existing memory</small>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>{conflict.existing}</p>
        </div>
      </div>
      <div style={{ borderLeft: "2px solid var(--warn)", padding: "2px 0 2px 12px", display: "grid", gap: 3 }}>
        <small style={uppercaseLabel}>recommended: {token(conflict.recommendedAction)}</small>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{conflict.recommendation}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,0.5fr) minmax(220px,1fr) auto", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 5, color: "var(--muted)", fontSize: 11 }}>
          <span style={uppercaseLabel}>Action</span>
          <select
            className="hb-input"
            value={action}
            onChange={(event) => setAction(event.target.value as ConflictResolutionAction)}
            style={{ ...formInput, minHeight: 36, color: "var(--text)" }}
          >
            {conflictActionOptions.map((option) => (
              <option key={option.action} value={option.action}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, color: "var(--muted)", fontSize: 11 }}>
          <span style={uppercaseLabel}>Auditable reason (required)</span>
          <input
            className="hb-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this the correct resolution?"
            style={formInput}
          />
        </label>
        <button
          type="button"
          onClick={() =>
            onResolve(conflict.id, {
              action,
              reason: reason.trim(),
              mergedText: isMerge ? mergedText.trim() : undefined
            })
          }
          disabled={isMutating || !canResolve}
          className="hb-hover-bright"
          style={{ ...primaryBtn, minHeight: 36, padding: "0 14px" }}
        >
          <Check size={13} aria-hidden strokeWidth={2.5} />
          Resolve
        </button>
        {isMerge ? (
          <label style={{ gridColumn: "1 / -1", display: "grid", gap: 5, color: "var(--muted)", fontSize: 11 }}>
            <span style={uppercaseLabel}>Merged canonical text (required)</span>
            <textarea
              className="hb-input"
              rows={3}
              value={mergedText}
              onChange={(event) => setMergedText(event.target.value)}
              style={{ ...formInput, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

function TracesView({
  traces,
  feedback,
  selectedTrace,
  selectedTraceId,
  setSelectedTraceId,
  isMutating,
  onSelectMemory,
  onSubmitFeedback
}: {
  traces: MemoryTrace[];
  feedback: DashboardSnapshot["feedback"];
  selectedTrace?: MemoryTrace;
  selectedTraceId: string;
  setSelectedTraceId: (id: string) => void;
  isMutating: boolean;
  onSelectMemory: (id: string) => void;
  onSubmitFeedback: (traceId: string, input: TraceFeedbackInput) => void;
}) {
  const meta = selectedTrace ? traceMeta(selectedTrace) : null;
  const groups = selectedTrace
    ? [
        { title: `used (${selectedTrace.usedMemories.length})`, tone: "var(--good)", items: selectedTrace.usedMemories },
        { title: `ignored (${selectedTrace.ignoredMemories.length})`, tone: "var(--warn)", items: selectedTrace.ignoredMemories },
        { title: `excluded (${selectedTrace.excludedMemories.length})`, tone: "var(--bad)", items: selectedTrace.excludedMemories }
      ]
    : [];
  const traceFeedback = feedback.filter((item) => item.traceId === selectedTraceId);

  return (
    <div
      data-screen-label="Traces"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(300px,0.75fr) minmax(0,1.45fr)",
        gap: 14,
        alignItems: "start"
      }}
    >
      <section aria-label="Trace runs" style={{ ...panel({ padding: 14 }), display: "grid", gap: 8, position: "sticky", top: 16 }}>
        <span style={{ ...uppercaseLabel, padding: "2px 4px" }}>Recall runs · newest first</span>
        {traces.length ? (
          traces.map((trace) => {
            const rowMeta = traceMeta(trace);
            const selected = trace.id === selectedTraceId;
            return (
              <button
                key={trace.id}
                type="button"
                onClick={() => setSelectedTraceId(trace.id)}
                className="hb-hover-accent"
                style={{
                  border: selected ? "1px solid var(--accent)" : "1px solid var(--line2)",
                  borderRadius: 10,
                  background: selected ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "var(--inset)",
                  padding: 12,
                  display: "grid",
                  gap: 6,
                  textAlign: "left",
                  width: "100%"
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <strong style={{ fontFamily: mono, fontSize: 12, color: "var(--chip)" }}>{trace.hostId}</strong>
                    <span style={{ fontFamily: mono, fontSize: 10, color: "var(--subtle)", border: "1px solid var(--line)", borderRadius: 4, padding: "0 5px" }}>
                      {shortMode(rowMeta.mode)}
                    </span>
                  </span>
                  <small style={{ fontFamily: mono, fontSize: 10.5, color: "var(--subtle)", whiteSpace: "nowrap" }}>
                    {fmt(trace.createdAt)}
                  </small>
                </span>
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: "var(--body)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }}
                >
                  {trace.query}
                </span>
                <small style={{ fontFamily: mono, fontSize: 10.5, color: "var(--subtle)" }}>
                  {trace.usedMemories.length} used · {trace.ignoredMemories.length} ignored ·{" "}
                  {trace.excludedMemories.length} excluded
                </small>
              </button>
            );
          })
        ) : (
          <EmptyState
            icon={<GitBranch size={22} aria-hidden />}
            title="No traces yet"
            body="continuity_bootstrap, memory_recall, and memory_trace calls will appear here."
            minHeight={160}
          />
        )}
      </section>

      <section aria-label="Trace detail" style={{ ...panel({ padding: 18 }), display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {selectedTrace && meta ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: "var(--subtle)" }}>
                  {selectedTrace.id} · {selectedTrace.runId}
                </span>
                <span style={{ ...typeTagStyle, borderRadius: 4 }}>{meta.mode}</span>
              </span>
              <span style={monoSubtle}>
                {selectedTrace.hostId} · {selectedTrace.agentProfileId}
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: display, fontSize: 17, lineHeight: 1.45, color: "var(--text)" }}>
              “{selectedTrace.query}”
            </p>
            <div style={{ border: "1px solid var(--line2)", borderRadius: 10, background: "var(--inset)", padding: 12, display: "grid", gap: 4 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <small style={{ ...uppercaseLabel, flex: "1 1 auto", whiteSpace: "nowrap" }}>
                  context pack sent to the agent
                </small>
                <span style={{ display: "flex", alignItems: "center", gap: 7, flex: "0 0 auto" }}>
                  <span style={{ width: 70, height: 4, borderRadius: 99, background: "var(--line2)", overflow: "hidden", display: "inline-block" }}>
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${Math.min(100, Math.round((meta.est / meta.budget) * 100))}%`,
                        background: "var(--accent)",
                        borderRadius: 99
                      }}
                    />
                  </span>
                  <small style={{ fontFamily: mono, fontSize: 10.5, color: "var(--subtle)", whiteSpace: "nowrap" }}>
                    ~{meta.est} / {meta.budget} tokens
                  </small>
                </span>
              </span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--body)" }}>{selectedTrace.contextPack}</p>
            </div>

            {groups.map((group) => (
              <div key={group.title} style={{ display: "grid", gap: 8 }}>
                <span style={{ ...uppercaseLabel, color: group.tone, letterSpacing: "0.07em" }}>{group.title}</span>
                {group.items.length ? (
                  group.items.map((item) => (
                    <article
                      key={item.memoryId}
                      style={{
                        border: "1px solid var(--line2)",
                        borderLeft: `2px solid ${group.tone}`,
                        borderRadius: 9,
                        background: "var(--inset)",
                        padding: 11,
                        display: "grid",
                        gap: 6
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => onSelectMemory(item.memoryId)}
                          style={{ border: 0, background: "transparent", padding: 0, fontFamily: mono, fontSize: 11.5, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
                        >
                          {item.memoryId}
                        </button>
                        <span style={typeTagStyle}>{item.type}</span>
                        <span style={chipStyle(group.tone)}>
                          {item.score !== undefined ? `score ${pct(item.score)}` : "no score"}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--body)" }}>{item.text}</p>
                      <small style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.45 }}>{item.reason}</small>
                    </article>
                  ))
                ) : (
                  <small style={{ color: "var(--subtle)", fontSize: 12 }}>None recorded for this trace.</small>
                )}
              </div>
            ))}

            <TraceFeedbackPanel
              key={selectedTrace.id}
              traceId={selectedTrace.id}
              feedback={traceFeedback}
              isMutating={isMutating}
              onSubmit={onSubmitFeedback}
            />
          </>
        ) : (
          <EmptyState
            icon={<GitBranch size={22} aria-hidden />}
            title="Select a trace"
            body="Inspect used, ignored, and excluded memories plus the compact context pack."
            minHeight={220}
          />
        )}
      </section>
    </div>
  );
}

export function TraceFeedbackPanel({
  traceId,
  feedback,
  isMutating,
  onSubmit
}: {
  traceId: string;
  feedback: DashboardSnapshot["feedback"];
  isMutating: boolean;
  onSubmit: (traceId: string, input: TraceFeedbackInput) => void;
}) {
  const [rating, setRating] = useState<TraceFeedbackInput["rating"]>("helpful");
  const [note, setNote] = useState("");
  const disabled = rating === "unhelpful" && !note.trim();

  const choiceStyle = (active: boolean, tone: string): CSSProperties =>
    active
      ? {
          minHeight: 34,
          border: `1px solid color-mix(in srgb, ${tone} 50%, transparent)`,
          borderRadius: 8,
          background: `color-mix(in srgb, ${tone} 9%, transparent)`,
          color: tone,
          padding: "0 12px",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12.5,
          fontWeight: 600
        }
      : {
          minHeight: 34,
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "transparent",
          color: "var(--muted)",
          padding: "0 12px",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12.5
        };

  return (
    <div style={{ borderTop: "1px solid var(--line2)", paddingTop: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <strong style={{ fontSize: 13.5 }}>Was this trace useful?</strong>
        <span style={monoSubtle}>{feedback.length} submitted</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          aria-pressed={rating === "helpful"}
          onClick={() => setRating("helpful")}
          style={choiceStyle(rating === "helpful", "var(--good)")}
        >
          <ThumbsUp size={14} aria-hidden />
          Helpful
        </button>
        <button
          type="button"
          aria-pressed={rating === "unhelpful"}
          onClick={() => setRating("unhelpful")}
          style={choiceStyle(rating === "unhelpful", "var(--bad)")}
        >
          <ThumbsDown size={14} aria-hidden />
          Unhelpful
        </button>
        <input
          className="hb-input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            rating === "unhelpful"
              ? "What went wrong? Becomes a pending correction…"
              : "Optional note"
          }
          style={{
            flex: "1 1 220px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--inset)",
            color: "var(--text)",
            outline: "none",
            padding: "0 10px",
            minHeight: 34,
            fontSize: 12.5,
            boxSizing: "border-box"
          }}
        />
        <button
          type="button"
          onClick={() => {
            onSubmit(traceId, {
              rating,
              reason: note.trim() || undefined,
              correction: rating === "unhelpful" ? note.trim() || undefined : undefined
            });
            setNote("");
          }}
          disabled={isMutating || disabled}
          className="hb-hover-bright"
          style={{ ...primaryBtn, minHeight: 34 }}
        >
          Submit
        </button>
      </div>
      {feedback.map((item) => (
        <div key={item.id} style={{ border: "1px solid var(--line2)", borderRadius: 9, background: "var(--inset)", padding: 10, display: "grid", gap: 4 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={chipStyle(item.rating === "helpful" ? "var(--good)" : "var(--bad)")}>{item.rating}</span>
            <small style={{ fontFamily: mono, color: "var(--subtle)", fontSize: 10.5 }}>{fmt(item.createdAt)}</small>
          </span>
          {item.reason ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{item.reason}</p>
          ) : null}
          {item.correctionMemoryId ? (
            <small style={{ fontFamily: mono, fontSize: 10.5, color: "var(--subtle)" }}>
              → queued pending correction {item.correctionMemoryId}
            </small>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function AuditView({
  events,
  onOpen
}: {
  events: MemoryEvent[];
  onOpen?: (memoryId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "deletes">("all");
  const sorted = [...events].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const deletions = sorted.filter((event) => event.eventType === "deleted").length;
  const shown = filter === "deletes" ? sorted.filter((event) => event.eventType === "deleted") : sorted;

  const segStyle = (active: boolean): CSSProperties => ({
    border: 0,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--accent-ink)" : "var(--subtle)",
    fontWeight: active ? 600 : 400,
    minHeight: 30,
    padding: "0 12px",
    fontSize: 12
  });

  return (
    <div data-screen-label="Audit" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div role="group" aria-label="Audit filter" style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden" }}>
          <button type="button" onClick={() => setFilter("all")} style={segStyle(filter === "all")}>
            All events
          </button>
          <button type="button" onClick={() => setFilter("deletes")} style={segStyle(filter === "deletes")}>
            Deletions
          </button>
        </div>
        <span style={monoSubtle}>
          {sorted.length} events · {deletions} hard deletes · content of deleted memories is never
          retained
        </span>
      </div>
      <section aria-label="Audit &amp; Deletion History" style={{ ...panel({ padding: "6px 16px" }), display: "grid" }}>
        {shown.length ? (
          shown.map((event) => (
            <div
              key={event.id}
              style={
                event.eventType === "deleted"
                  ? {
                      display: "grid",
                      gridTemplateColumns: "14px minmax(0,1fr) auto",
                      gap: 12,
                      padding: "12px 10px",
                      borderBottom: "1px solid var(--line2)",
                      background: "color-mix(in srgb, var(--bad) 5%, transparent)",
                      borderRadius: 8,
                      margin: "4px -10px"
                    }
                  : {
                      display: "grid",
                      gridTemplateColumns: "14px minmax(0,1fr) auto",
                      gap: 12,
                      padding: "12px 0",
                      borderBottom: "1px solid var(--line2)"
                    }
              }
            >
              <span style={{ width: 8, height: 8, borderRadius: 99, background: eventToneVar(event.eventType), marginTop: 6 }} />
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 13 }}>{token(event.eventType)}</strong>
                  <button
                    type="button"
                    onClick={() => onOpen?.(event.memoryId)}
                    style={{ border: 0, background: "transparent", padding: 0, fontFamily: mono, fontSize: 11, color: "var(--accent)" }}
                  >
                    {event.memoryId}
                  </button>
                </span>
                <small style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.45 }}>{event.reason}</small>
                {event.scopeLabel ? (
                  <small style={{ fontFamily: mono, fontSize: 10.5, color: "var(--subtle)" }}>
                    scope: {event.scopeLabel}
                  </small>
                ) : null}
              </div>
              <small style={{ fontFamily: mono, color: "var(--subtle)", fontSize: 11, whiteSpace: "nowrap", textAlign: "right" }}>
                {event.actorType}:{event.actorId}
                <br />
                {fmt(event.createdAt)}
              </small>
            </div>
          ))
        ) : (
          <EmptyState
            icon={<History size={22} aria-hidden />}
            title="Nothing here yet"
            body="Lifecycle and deletion events will appear here."
            minHeight={140}
          />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect modal
// ---------------------------------------------------------------------------

function ConnectModal({
  host,
  setHost,
  copiedKey,
  onCopy,
  onClose
}: {
  host: ConnectHost;
  setHost: (host: ConnectHost) => void;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  onClose: () => void;
}) {
  const snippet = connectSnippet(host);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect an agent"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(12,9,5,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 24
      }}
    >
      <div
        className="hb-scroll"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(660px, 100%)",
          maxHeight: "88vh",
          overflow: "auto",
          ...panel({ padding: "20px 22px" }),
          boxShadow: "var(--shadow)",
          display: "grid",
          gap: 14,
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Remote streamable HTTP MCP
            </span>
            <h2 style={{ margin: 0, fontFamily: display, fontSize: 19, fontWeight: 600 }}>Connect an agent</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hb-hover-accent"
            style={{ border: "1px solid var(--line)", borderRadius: 8, background: "transparent", color: "var(--muted)", width: 30, height: 30, display: "grid", placeItems: "center", flex: "0 0 auto" }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--muted)" }}>
          Any MCP host — Codex, Claude Code, Cursor, or a custom agent — connects to the same vault.
          Sessions start with <span style={{ fontFamily: mono, fontSize: 12, color: "var(--chip)" }}>continuity_bootstrap</span>, and
          every answer can explain itself with <span style={{ fontFamily: mono, fontSize: 12, color: "var(--chip)" }}>memory_trace</span>.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--line2)", borderRadius: 9, background: "var(--inset)", padding: "10px 12px" }}>
          <span style={{ fontFamily: mono, fontSize: 12.5, color: "var(--body)", overflowWrap: "anywhere" }}>{MCP_ENDPOINT}</span>
          <button
            type="button"
            onClick={() => onCopy("endpoint", MCP_ENDPOINT)}
            className="hb-hover-accent"
            style={{ border: "1px solid var(--line)", borderRadius: 7, background: "transparent", color: "var(--accent)", fontFamily: mono, fontSize: 11, minHeight: 26, padding: "0 10px", whiteSpace: "nowrap" }}
          >
            {copiedKey === "endpoint" ? "copied ✓" : "copy"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {mcpTools.map((tool) => (
            <div key={tool.name} style={{ border: "1px solid var(--line2)", borderRadius: 8, background: "var(--inset)", padding: 9, display: "grid", gap: 3, alignContent: "start" }}>
              <strong style={{ fontFamily: mono, fontSize: 11, color: "var(--chip)", overflowWrap: "anywhere" }}>{tool.name}</strong>
              <small style={{ color: "var(--subtle)", fontSize: 10.5, lineHeight: 1.4 }}>{tool.desc}</small>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div role="group" aria-label="Host" style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden" }}>
              {connectHosts.map((option) => {
                const active = option === host;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setHost(option)}
                    style={{
                      border: 0,
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "var(--accent-ink)" : "var(--subtle)",
                      fontWeight: active ? 600 : 400,
                      minHeight: 30,
                      padding: "0 11px",
                      fontSize: 12
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onCopy("snippet", snippet)}
              className="hb-hover-accent"
              style={{ border: "1px solid var(--line)", borderRadius: 7, background: "transparent", color: "var(--accent)", fontFamily: mono, fontSize: 11, minHeight: 26, padding: "0 10px", whiteSpace: "nowrap" }}
            >
              {copiedKey === "snippet" ? "copied ✓" : "copy"}
            </button>
          </div>
          <pre
            className="hb-scroll"
            style={{
              margin: 0,
              border: "1px solid var(--line2)",
              borderRadius: 9,
              background: "var(--inset)",
              color: "var(--body)",
              padding: 12,
              overflow: "auto",
              fontFamily: mono,
              fontSize: 11.5,
              lineHeight: 1.6,
              whiteSpace: "pre"
            }}
          >
            {snippet}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toLoadError(error: unknown): LoadError {
  if (
    error instanceof MemoryClientError &&
    (error.code === "dashboard_configuration_error" || error.status === 503)
  ) {
    return { kind: "configuration", message: error.message };
  }
  return {
    kind: "load",
    message: error instanceof Error ? error.message : "Unable to load dashboard."
  };
}
