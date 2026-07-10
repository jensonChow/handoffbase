"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  Clock3,
  Database,
  Eye,
  FilePenLine,
  Filter,
  GitBranch,
  History,
  Inbox,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardRuntimeStatus } from "@/components/dashboard-runtime-status";
import {
  createMemoryClient,
  MemoryClientError,
  type ConflictCandidate,
  type DashboardSnapshot,
  type MemoryClientMode,
  type MemoryRecord,
  type MemoryStatus,
  type MemoryTrace,
  type MemoryType
} from "@/lib/memory-client";

type ViewKey = "vault" | "pending" | "trace" | "conflicts";

type LoadError = {
  kind: "configuration" | "load";
  message: string;
};

type MutationError = {
  kind: "mutation" | "refresh";
  message: string;
};

type EditState = {
  type: MemoryType;
  status: MemoryStatus;
  confidence: number;
  importance: number;
  canonicalText: string;
  validFrom: string;
  validUntil: string;
  validityReason: string;
};

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
  const [view, setView] = useState<ViewKey>("vault");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string>("");
  const [selectedTraceId, setSelectedTraceId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MemoryType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MemoryStatus>("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [mutationError, setMutationError] = useState<MutationError | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionReason, setActionReason] = useState("User requested memory lifecycle update.");

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setMutationError(null);
      const data = await client.listDashboard();
      setSnapshot(data);
      setSelectedMemoryId((current) =>
        data.memories.some((memory) => memory.id === current)
          ? current
          : data.memories[0]?.id || ""
      );
      setSelectedTraceId((current) =>
        data.traces.some((trace) => trace.id === current)
          ? current
          : data.traces[0]?.id || ""
      );
    } catch (caught) {
      setLoadError(toLoadError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

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
      type: selectedMemory.type,
      status: selectedMemory.status,
      confidence: selectedMemory.confidence,
      importance: selectedMemory.importance,
      canonicalText: selectedMemory.canonicalText,
      validFrom: toInputDate(selectedMemory.validity.validFrom),
      validUntil: selectedMemory.validity.validUntil
        ? toInputDate(selectedMemory.validity.validUntil)
        : "",
      validityReason: selectedMemory.validity.reason ?? ""
    });
    setDeleteConfirm(false);
  }, [selectedMemory]);

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
        memory.source.kind,
        scopeLabel(memory)
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = haystack.includes(query.toLowerCase().trim());
      const matchesType = typeFilter === "all" || memory.type === typeFilter;
      const matchesStatus = statusFilter === "all" || memory.status === statusFilter;
      const matchesScope =
        scopeFilter === "all" ||
        (scopeFilter === "user" && Boolean(memory.scope.userId)) ||
        (scopeFilter === "project" && Boolean(memory.scope.projectId)) ||
        (scopeFilter === "agent" && Boolean(memory.scope.agentProfileId)) ||
        (scopeFilter === "host" && Boolean(memory.scope.hostId)) ||
        (scopeFilter === "tool" && Boolean(memory.scope.toolId));

      return matchesQuery && matchesType && matchesStatus && matchesScope;
    });
  }, [query, scopeFilter, snapshot, statusFilter, typeFilter]);

  const pendingMemories = useMemo(
    () => snapshot?.memories.filter((memory) => memory.status === "pending") ?? [],
    [snapshot]
  );

  const stats = useMemo(() => {
    const memories = snapshot?.memories ?? [];
    return {
      total: memories.length,
      active: memories.filter((memory) => memory.status === "active").length,
      pending: memories.filter((memory) => memory.status === "pending").length,
      invalid: memories.filter((memory) =>
        ["invalidated", "expired", "superseded"].includes(memory.status)
      ).length,
      traces: snapshot?.traces.length ?? 0
    };
  }, [snapshot]);

  async function refreshAfterMutation(selectId?: string) {
    const data = await client.listDashboard();
    setSnapshot(data);

    if (selectId && data.memories.some((memory) => memory.id === selectId)) {
      setSelectedMemoryId(selectId);
      return;
    }

    if (!data.memories.some((memory) => memory.id === selectedMemoryId)) {
      setSelectedMemoryId(data.memories[0]?.id || "");
    }
  }

  async function runMutation(action: () => Promise<MemoryRecord | void>, selectId?: string) {
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
  }

  function selectMemory(memoryId: string) {
    setSelectedMemoryId(memoryId);
    setView("vault");
  }

  const runtimeMode =
    snapshot?.runtime.mode ?? (clientMode === "mock" ? "mock_demo" : undefined);

  const shell = (
    <main className="dashboard-shell">
      <aside className="side-nav" aria-label="Dashboard navigation">
        <div className="brand-lockup">
          <Database size={24} aria-hidden="true" />
          <div>
            <p className="eyebrow">handoffbase</p>
            <h1>HandoffBase Memory Vault</h1>
          </div>
        </div>

        <nav className="nav-list">
          <NavButton
            active={view === "vault"}
            icon={<Database size={18} aria-hidden="true" />}
            label="Memory Vault"
            count={stats.total}
            onClick={() => setView("vault")}
          />
          <NavButton
            active={view === "pending"}
            icon={<Inbox size={18} aria-hidden="true" />}
            label="Pending Review"
            count={stats.pending}
            onClick={() => setView("pending")}
          />
          <NavButton
            active={view === "trace"}
            icon={<GitBranch size={18} aria-hidden="true" />}
            label="Memory Trace"
            count={stats.traces}
            onClick={() => setView("trace")}
          />
          <NavButton
            active={view === "conflicts"}
            icon={<AlertTriangle size={18} aria-hidden="true" />}
            label="Conflicts"
            count={snapshot?.conflicts.length ?? 0}
            onClick={() => setView("conflicts")}
          />
        </nav>

        <DashboardRuntimeStatus mode={runtimeMode} />
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">HandoffBase Memory Vault</p>
            <h2>{viewTitle(view)}</h2>
          </div>
          <button
            className="icon-text-button"
            type="button"
            onClick={loadDashboard}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            <RefreshCcw
              className={isLoading ? "is-spinning" : undefined}
              size={16}
              aria-hidden="true"
            />
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </header>

        <div className="metric-strip" aria-label="Memory status summary">
          <Metric label="Total memories" value={stats.total} tone="neutral" />
          <Metric label="Active" value={stats.active} tone="green" />
          <Metric label="Pending review" value={stats.pending} tone="amber" />
          <Metric label="Inactive memories" value={stats.invalid} tone="red" />
          <Metric label="Trace runs" value={stats.traces} tone="violet" />
        </div>

        {loadError ? (
          <ErrorState error={loadError} onRetry={loadDashboard} />
        ) : null}

        {mutationError ? (
          <MutationErrorState
            error={mutationError}
            onDismiss={() => setMutationError(null)}
          />
        ) : null}

        {isMutating ? (
          <div className="mutation-progress" role="status">
            <Clock3 size={18} aria-hidden="true" />
            Applying memory change to the active store…
          </div>
        ) : null}

        {snapshot ? (
          <>
            {view === "vault" ? (
              <VaultView
                memories={filteredMemories}
                hasStoredMemories={snapshot.memories.length > 0}
                selectedMemory={selectedMemory}
                selectedEvents={selectedEvents}
                editState={editState}
                query={query}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                scopeFilter={scopeFilter}
                deleteConfirm={deleteConfirm}
                actionReason={actionReason}
                isMutating={isMutating}
                setQuery={setQuery}
                setTypeFilter={setTypeFilter}
                setStatusFilter={setStatusFilter}
                setScopeFilter={setScopeFilter}
                setEditState={setEditState}
                setDeleteConfirm={setDeleteConfirm}
                setActionReason={setActionReason}
                selectMemory={setSelectedMemoryId}
                onSave={() => {
                  if (!selectedMemory || !editState) {
                    return;
                  }

                  void runMutation(
                    () =>
                      client.updateMemory(selectedMemory.id, {
                        type: editState.type,
                        status: editState.status,
                        confidence: editState.confidence,
                        importance: editState.importance,
                        canonicalText: editState.canonicalText,
                        validity: {
                          validFrom: fromInputDate(editState.validFrom),
                          validUntil: editState.validUntil
                            ? fromInputDate(editState.validUntil)
                            : undefined,
                          reason: editState.validityReason
                        }
                      }),
                    selectedMemory.id
                  );
                }}
                onApprove={() => {
                  if (selectedMemory) {
                    void runMutation(
                      () => client.approveMemory(selectedMemory.id),
                      selectedMemory.id
                    );
                  }
                }}
                onInvalidate={() => {
                  if (selectedMemory) {
                    void runMutation(
                      () => client.invalidateMemory(selectedMemory.id, actionReason),
                      selectedMemory.id
                    );
                  }
                }}
                onDelete={() => {
                  if (selectedMemory) {
                    void runMutation(
                      () => client.deleteMemory(selectedMemory.id, actionReason),
                      ""
                    );
                  }
                }}
              />
            ) : null}

            {view === "pending" ? (
              <PendingView
                memories={pendingMemories}
                isMutating={isMutating}
                onSelect={selectMemory}
                onApprove={(memoryId) =>
                  void runMutation(() => client.approveMemory(memoryId), memoryId)
                }
                onInvalidate={(memoryId) =>
                  void runMutation(
                    () =>
                      client.invalidateMemory(
                        memoryId,
                        "Invalidated from Pending Memories review."
                      ),
                    memoryId
                  )
                }
                onDelete={(memoryId) =>
                  void runMutation(
                    () => client.deleteMemory(memoryId, "Deleted from Pending Memories review."),
                    ""
                  )
                }
              />
            ) : null}

            {view === "trace" ? (
              <TraceView
                traces={snapshot?.traces ?? []}
                selectedTrace={selectedTrace}
                selectedTraceId={selectedTraceId}
                setSelectedTraceId={setSelectedTraceId}
                onSelectMemory={selectMemory}
              />
            ) : null}

            {view === "conflicts" ? (
              <ConflictView conflicts={snapshot.conflicts} />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );

  if (isLoading && !snapshot) {
    return (
      <main className="dashboard-shell">
        <aside className="side-nav skeleton-nav" />
        <section className="workspace">
          <div className="loading-panel">
            <Clock3 size={24} aria-hidden="true" />
            <div>
              <h2>Loading Memory Vault</h2>
              <p>Fetching HandoffBase memory records, trace runs, and pending review queue.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return shell;
}

function VaultView(props: {
  memories: MemoryRecord[];
  hasStoredMemories: boolean;
  selectedMemory?: MemoryRecord;
  selectedEvents: DashboardSnapshot["events"];
  editState: EditState | null;
  query: string;
  typeFilter: "all" | MemoryType;
  statusFilter: "all" | MemoryStatus;
  scopeFilter: string;
  deleteConfirm: boolean;
  actionReason: string;
  isMutating: boolean;
  setQuery: (value: string) => void;
  setTypeFilter: (value: "all" | MemoryType) => void;
  setStatusFilter: (value: "all" | MemoryStatus) => void;
  setScopeFilter: (value: string) => void;
  setEditState: (value: EditState | null) => void;
  setDeleteConfirm: (value: boolean) => void;
  setActionReason: (value: string) => void;
  selectMemory: (memoryId: string) => void;
  onSave: () => void;
  onApprove: () => void;
  onInvalidate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="content-grid">
      <section className="list-panel" aria-label="Memory Vault list">
        <div className="toolbar">
          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search memories</span>
            <input
              value={props.query}
              onChange={(event) => props.setQuery(event.target.value)}
              placeholder="Search text, source, status, or scope"
            />
          </label>

          <label className="filter-control">
            <Filter size={15} aria-hidden="true" />
            <span>Type</span>
            <select
              value={props.typeFilter}
              onChange={(event) => props.setTypeFilter(event.target.value as "all" | MemoryType)}
            >
              <option value="all">All types</option>
              {memoryTypes.map((type) => (
                <option value={type} key={type}>
                  {formatToken(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Status</span>
            <select
              value={props.statusFilter}
              onChange={(event) =>
                props.setStatusFilter(event.target.value as "all" | MemoryStatus)
              }
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {formatToken(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Scope</span>
            <select
              value={props.scopeFilter}
              onChange={(event) => props.setScopeFilter(event.target.value)}
            >
              <option value="all">All scopes</option>
              <option value="user">User</option>
              <option value="project">Project</option>
              <option value="agent">Agent</option>
              <option value="host">Host</option>
              <option value="tool">Tool</option>
            </select>
          </label>
        </div>

        {props.memories.length ? (
          <MemoryTable
            memories={props.memories}
            selectedId={props.selectedMemory?.id ?? ""}
            onSelect={props.selectMemory}
          />
        ) : (
          <EmptyState
            icon={<Inbox size={24} aria-hidden="true" />}
            title={
              props.hasStoredMemories
                ? "No memories match these filters"
                : "No memories in this store"
            }
            body={
              props.hasStoredMemories
                ? "Clear search or select a broader type, status, or scope filter."
                : "The connected server store is ready for the first scoped memory write."
            }
          />
        )}
      </section>

      <MemoryDetailPanel {...props} />
    </div>
  );
}

function MemoryTable({
  memories,
  selectedId,
  onSelect
}: {
  memories: MemoryRecord[];
  selectedId: string;
  onSelect: (memoryId: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="memory-table">
        <thead>
          <tr>
            <th>Memory</th>
            <th>Type</th>
            <th>Scope</th>
            <th>Status</th>
            <th>Confidence</th>
            <th>Importance</th>
            <th>Validity</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {memories.map((memory) => (
            <tr key={memory.id} className={memory.id === selectedId ? "is-selected" : ""}>
              <td>
                <button
                  className="table-memory-button"
                  type="button"
                  onClick={() => onSelect(memory.id)}
                >
                  <span>{memory.canonicalText}</span>
                  <small>{memory.id}</small>
                </button>
              </td>
              <td>
                <Token>{formatToken(memory.type)}</Token>
              </td>
              <td>{scopeLabel(memory)}</td>
              <td>
                <StatusBadge status={memory.status} />
              </td>
              <td>{toPercent(memory.confidence)}</td>
              <td>{toPercent(memory.importance)}</td>
              <td>{validityLabel(memory)}</td>
              <td>{formatDate(memory.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemoryDetailPanel(props: {
  selectedMemory?: MemoryRecord;
  selectedEvents: DashboardSnapshot["events"];
  editState: EditState | null;
  deleteConfirm: boolean;
  actionReason: string;
  isMutating: boolean;
  setEditState: (value: EditState | null) => void;
  setDeleteConfirm: (value: boolean) => void;
  setActionReason: (value: string) => void;
  onSave: () => void;
  onApprove: () => void;
  onInvalidate: () => void;
  onDelete: () => void;
}) {
  if (!props.selectedMemory || !props.editState) {
    return (
      <section className="detail-panel" aria-label="Memory details">
        <EmptyState
          icon={<FilePenLine size={24} aria-hidden="true" />}
          title="Select a memory"
          body="Choose a row to inspect source, scope, edit controls, lifecycle actions, and audit events."
        />
      </section>
    );
  }

  const memory = props.selectedMemory;
  const edit = props.editState;

  function patchEdit(patch: Partial<EditState>) {
    props.setEditState({ ...edit, ...patch });
  }

  return (
    <section className="detail-panel" aria-label="Memory details and edit controls">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Detail / edit</p>
          <h3>{memory.id}</h3>
        </div>
        <StatusBadge status={memory.status} />
      </div>

      <label className="field-block">
        <span>Canonical memory text</span>
        <textarea
          value={edit.canonicalText}
          onChange={(event) => patchEdit({ canonicalText: event.target.value })}
          rows={6}
        />
      </label>

      {memory.rawSource ? (
        <div className="source-excerpt">
          <span>Raw extraction source</span>
          <p>{memory.rawSource}</p>
        </div>
      ) : null}

      <div className="field-grid">
        <label className="field-block">
          <span>Type</span>
          <select
            value={edit.type}
            onChange={(event) => patchEdit({ type: event.target.value as MemoryType })}
          >
            {memoryTypes.map((type) => (
              <option key={type} value={type}>
                {formatToken(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-block">
          <span>Status</span>
          <select
            value={edit.status}
            onChange={(event) => patchEdit({ status: event.target.value as MemoryStatus })}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatToken(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-grid">
        <label className="field-block">
          <span>Confidence {toPercent(edit.confidence)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={edit.confidence}
            onChange={(event) => patchEdit({ confidence: Number(event.target.value) })}
          />
        </label>

        <label className="field-block">
          <span>Importance {toPercent(edit.importance)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={edit.importance}
            onChange={(event) => patchEdit({ importance: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="field-grid">
        <label className="field-block">
          <span>Valid from</span>
          <input
            type="date"
            value={edit.validFrom}
            onChange={(event) => patchEdit({ validFrom: event.target.value })}
          />
        </label>

        <label className="field-block">
          <span>Valid until</span>
          <input
            type="date"
            value={edit.validUntil}
            onChange={(event) => patchEdit({ validUntil: event.target.value })}
          />
        </label>
      </div>

      <label className="field-block">
        <span>Validity reason</span>
        <input
          value={edit.validityReason}
          onChange={(event) => patchEdit({ validityReason: event.target.value })}
        />
      </label>

      <dl className="metadata-list">
        <div>
          <dt>Scope</dt>
          <dd>{scopeLabel(memory)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {formatToken(memory.source.kind)} / {memory.source.label}
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(memory.createdAt)}</dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd>{memory.lastUsedAt ? formatDate(memory.lastUsedAt) : "Not used yet"}</dd>
        </div>
      </dl>

      <label className="field-block">
        <span>Action reason</span>
        <input
          value={props.actionReason}
          onChange={(event) => props.setActionReason(event.target.value)}
        />
      </label>

      <div className="action-row">
        <button
          className="primary-button"
          type="button"
          onClick={props.onSave}
          disabled={props.isMutating}
        >
          <Save size={16} aria-hidden="true" />
          Save
        </button>
        {memory.status === "pending" ? (
          <button
            className="success-button"
            type="button"
            onClick={props.onApprove}
            disabled={props.isMutating}
          >
            <Check size={16} aria-hidden="true" />
            Approve
          </button>
        ) : null}
        <button
          className="warning-button"
          type="button"
          onClick={props.onInvalidate}
          disabled={props.isMutating}
        >
          <Ban size={16} aria-hidden="true" />
          Invalidate
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={() => props.setDeleteConfirm(true)}
          disabled={props.isMutating}
        >
          <Trash2 size={16} aria-hidden="true" />
          Delete
        </button>
      </div>

      {props.deleteConfirm ? (
        <div className="delete-confirm">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>This removes the memory from the active dashboard store.</span>
          <button type="button" onClick={props.onDelete} disabled={props.isMutating}>
            Confirm delete
          </button>
          <button type="button" onClick={() => props.setDeleteConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className="event-log">
        <div className="panel-heading compact">
          <h4>Audit events</h4>
          <span>{props.selectedEvents.length}</span>
        </div>
        {props.selectedEvents.length ? (
          props.selectedEvents.map((event) => (
            <div className="event-row" key={event.id}>
              <History size={15} aria-hidden="true" />
              <div>
                <strong>{formatToken(event.eventType)}</strong>
                <p>{event.reason}</p>
                <small>
                  {event.actorType}:{event.actorId} / {formatDate(event.createdAt)}
                </small>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={<History size={20} aria-hidden="true" />}
            title="No audit events"
            body="New backend events will appear here after add, update, recall, or delete operations."
          />
        )}
      </div>
    </section>
  );
}

function PendingView({
  memories,
  isMutating,
  onSelect,
  onApprove,
  onInvalidate,
  onDelete
}: {
  memories: MemoryRecord[];
  isMutating: boolean;
  onSelect: (memoryId: string) => void;
  onApprove: (memoryId: string) => void;
  onInvalidate: (memoryId: string) => void;
  onDelete: (memoryId: string) => void;
}) {
  return (
    <section className="single-panel" aria-label="HandoffBase pending memory review">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Qwen extraction review</p>
          <h3>Pending Memory Candidates</h3>
        </div>
        <Token>{memories.length} candidates</Token>
      </div>

      {memories.length ? (
        <div className="pending-list">
          {memories.map((memory) => (
            <article className="pending-row" key={memory.id}>
              <div className="pending-copy">
                <div className="row-title">
                  <Token>{formatToken(memory.type)}</Token>
                  <span>{scopeLabel(memory)}</span>
                </div>
                <h4>Qwen-extracted candidate memory</h4>
                <p className="candidate-text">{memory.canonicalText}</p>
                {memory.rawSource ? (
                  <div className="source-excerpt compact">
                    <span>Extraction source</span>
                    <p>{memory.rawSource}</p>
                  </div>
                ) : null}
                <dl className="review-meta">
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {formatToken(memory.source.kind)} / {memory.source.label}
                    </dd>
                  </div>
                  <div>
                    <dt>Run</dt>
                    <dd>{memory.source.runId ?? "manual review"}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{toPercent(memory.confidence)}</dd>
                  </div>
                  <div>
                    <dt>Importance</dt>
                    <dd>{toPercent(memory.importance)}</dd>
                  </div>
                  <div>
                    <dt>Validity reason</dt>
                    <dd>{memory.validity.reason ?? "Pending reviewer decision."}</dd>
                  </div>
                </dl>
              </div>
              <div className="row-actions">
                <button type="button" className="ghost-button" onClick={() => onSelect(memory.id)}>
                  <Eye size={16} aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  className="success-button"
                  onClick={() => onApprove(memory.id)}
                  disabled={isMutating}
                >
                  <Check size={16} aria-hidden="true" />
                  Approve
                </button>
                <button
                  type="button"
                  className="warning-button"
                  onClick={() => onInvalidate(memory.id)}
                  disabled={isMutating}
                >
                  <X size={16} aria-hidden="true" />
                  Invalidate
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => onDelete(memory.id)}
                  disabled={isMutating}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Inbox size={24} aria-hidden="true" />}
          title="No pending memories"
          body="New automatic extractions and high-priority procedure candidates will wait here for approval."
        />
      )}
    </section>
  );
}

function TraceView({
  traces,
  selectedTrace,
  selectedTraceId,
  setSelectedTraceId,
  onSelectMemory
}: {
  traces: MemoryTrace[];
  selectedTrace?: MemoryTrace;
  selectedTraceId: string;
  setSelectedTraceId: (traceId: string) => void;
  onSelectMemory: (memoryId: string) => void;
}) {
  return (
    <div className="trace-grid">
      <section className="list-panel" aria-label="Memory traces">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Trace runs</p>
            <h3>Memory Trace Viewer</h3>
          </div>
        </div>

        {traces.length ? (
          <div className="trace-list">
            {traces.map((trace) => (
              <button
                type="button"
                className={trace.id === selectedTraceId ? "trace-row is-selected" : "trace-row"}
                key={trace.id}
                onClick={() => setSelectedTraceId(trace.id)}
              >
                <GitBranch size={17} aria-hidden="true" />
                <span>
                  <strong>{trace.query}</strong>
                  <small>
                    {trace.hostId} / {trace.agentProfileId} / {formatDate(trace.createdAt)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<GitBranch size={24} aria-hidden="true" />}
            title="No traces yet"
            body="Calls to continuity_bootstrap, memory_recall, or memory_trace will populate this viewer."
          />
        )}
      </section>

      <section className="detail-panel trace-detail" aria-label="Selected trace detail">
        {selectedTrace ? (
          <>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{selectedTrace.id}</p>
                <h3>{selectedTrace.runId}</h3>
              </div>
              <Token>{formatDate(selectedTrace.createdAt)}</Token>
            </div>
            <p className="trace-query">{selectedTrace.query}</p>
            <TraceMetaGrid trace={selectedTrace} />
            {selectedTrace.contextPack.trim() ? (
              <div className="context-pack">
                <h4>Context pack</h4>
                <p>{selectedTrace.contextPack}</p>
              </div>
            ) : null}
            <TraceMemoryGroup
              title={`Used memories (${selectedTrace.usedMemories.length})`}
              items={selectedTrace.usedMemories}
              tone="green"
              onSelectMemory={onSelectMemory}
            />
            <TraceMemoryGroup
              title={`Ignored memories (${selectedTrace.ignoredMemories.length})`}
              items={selectedTrace.ignoredMemories}
              tone="amber"
              onSelectMemory={onSelectMemory}
            />
            <TraceMemoryGroup
              title={`Excluded memories (${selectedTrace.excludedMemories.length})`}
              items={selectedTrace.excludedMemories}
              tone="red"
              onSelectMemory={onSelectMemory}
            />
          </>
        ) : (
          <EmptyState
            icon={<GitBranch size={24} aria-hidden="true" />}
            title="Select a trace"
            body="Inspect selected, ignored, and excluded memories plus the compact context pack."
          />
        )}
      </section>
    </div>
  );
}

function TraceMetaGrid({ trace }: { trace: MemoryTrace }) {
  const metadataEntries = Object.entries(trace.metadata ?? {}).filter(
    ([key]) => !["hostId", "agentProfileId"].includes(key)
  );

  return (
    <dl className="metadata-list trace-metadata">
      <div>
        <dt>Host</dt>
        <dd>{trace.hostId}</dd>
      </div>
      <div>
        <dt>Agent profile</dt>
        <dd>{trace.agentProfileId}</dd>
      </div>
      <div>
        <dt>Run</dt>
        <dd>{trace.runId}</dd>
      </div>
      <div>
        <dt>Memory counts</dt>
        <dd>
          {trace.usedMemories.length} used / {trace.ignoredMemories.length} ignored /{" "}
          {trace.excludedMemories.length} excluded
        </dd>
      </div>
      {metadataEntries.map(([key, value]) => (
        <div key={key}>
          <dt>{formatToken(key)}</dt>
          <dd>{formatMetadataValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TraceMemoryGroup({
  title,
  items,
  tone,
  onSelectMemory
}: {
  title: string;
  items: MemoryTrace["usedMemories"];
  tone: "green" | "amber" | "red";
  onSelectMemory: (memoryId: string) => void;
}) {
  return (
    <div className="trace-group">
      <h4>{title}</h4>
      {items.length ? (
        items.map((item) => (
          <article className={`trace-memory trace-${tone}`} key={item.memoryId}>
            <div className="trace-memory-head">
              <button type="button" onClick={() => onSelectMemory(item.memoryId)}>
                <Eye size={15} aria-hidden="true" />
                {item.memoryId}
              </button>
              <Token>{formatToken(item.type)}</Token>
              <Token>
                {item.score !== undefined ? `score ${toPercent(item.score)}` : "no score"}
              </Token>
            </div>
            <p>{item.text}</p>
            <dl className="reason-list">
              <div>
                <dt>Reason</dt>
                <dd>{item.reason}</dd>
              </div>
            </dl>
          </article>
        ))
      ) : (
        <p className="quiet-line">None recorded for this trace.</p>
      )}
    </div>
  );
}

function ConflictView({ conflicts }: { conflicts: ConflictCandidate[] }) {
  return (
    <section className="single-panel" aria-label="Conflict review">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Conflict review</p>
          <h3>Candidate conflicts</h3>
        </div>
        <Token>{conflicts.length} rows</Token>
      </div>

      {conflicts.length ? (
        <div className="conflict-list">
          {conflicts.map((conflict) => (
            <article className="conflict-row" key={conflict.id}>
              <div className="conflict-meta">
                <Token>{formatToken(conflict.conflictType)}</Token>
                <Token>{formatToken(conflict.severity)} severity</Token>
                <Token>{formatToken(conflict.memoryType)}</Token>
                <Token>{formatToken(conflict.status)}</Token>
                <span>{conflict.scopeLabel}</span>
              </div>
              <div className="comparison-grid">
                <div>
                  <h4>Candidate memory</h4>
                  <p>{conflict.incoming}</p>
                </div>
                <div>
                  <h4>Existing memory</h4>
                  <p>{conflict.existing}</p>
                </div>
              </div>
              <div className="recommendation">
                <span>Recommended action</span>
                <p>{conflict.recommendation}</p>
              </div>
              <div className="row-actions">
                <button type="button" className="ghost-button" disabled>
                  <Check size={16} aria-hidden="true" />
                  Keep incoming
                </button>
                <button type="button" className="ghost-button" disabled>
                  <X size={16} aria-hidden="true" />
                  Keep existing
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<AlertTriangle size={24} aria-hidden="true" />}
          title="No conflicts"
          body="Qwen conflict checks will surface supersede, merge, and reject candidates here."
        />
      )}
    </section>
  );
}

function NavButton({
  active,
  icon,
  label,
  count,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "nav-button is-active" : "nav-button"} onClick={onClick}>
      <span>
        {icon}
        {label}
      </span>
      <strong>{count}</strong>
    </button>
  );
}

function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "neutral" | "green" | "amber" | "red" | "violet";
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Token({ children }: { children: React.ReactNode }) {
  return <span className="token">{children}</span>;
}

function StatusBadge({ status }: { status: MemoryStatus }) {
  return <span className={`status-badge status-${status}`}>{formatToken(status)}</span>;
}

function EmptyState({
  icon,
  title,
  body
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  const isConfigurationError = error.kind === "configuration";

  return (
    <div
      className={
        isConfigurationError
          ? "error-state configuration-error"
          : "error-state"
      }
      role="alert"
    >
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h3>
          {isConfigurationError
            ? "Dashboard configuration required"
            : "Dashboard failed to load"}
        </h3>
        <p>{error.message}</p>
        {isConfigurationError ? (
          <p>Configure the memory store on the server, then retry this same-origin API request.</p>
        ) : null}
      </div>
      <button type="button" onClick={onRetry}>
        <RefreshCcw size={16} aria-hidden="true" />
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
    <div className="error-state mutation-error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h3>{refreshFailed ? "Memory changed; refresh failed" : "Memory change failed"}</h3>
        <p>{error.message}</p>
        <p>
          {refreshFailed
            ? "The server accepted the change. Refresh to confirm its latest stored state."
            : "The last successfully loaded dashboard state is still shown below."}
        </p>
      </div>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function toLoadError(error: unknown): LoadError {
  if (
    error instanceof MemoryClientError &&
    (error.code === "dashboard_configuration_error" || error.status === 503)
  ) {
    return {
      kind: "configuration",
      message: error.message
    };
  }

  return {
    kind: "load",
    message: error instanceof Error ? error.message : "Unable to load dashboard."
  };
}

function viewTitle(view: ViewKey) {
  const titles: Record<ViewKey, string> = {
    vault: "Inspect Memories",
    pending: "Review Pending Memories",
    trace: "Inspect Memory Traces",
    conflicts: "Resolve Memory Conflicts"
  };

  return titles[view];
}

function formatToken(value: string) {
  return value.replaceAll("_", " ");
}

function formatMetadataValue(value: string | number | boolean) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function scopeLabel(memory: MemoryRecord) {
  const scope = memory.scope;
  const parts = [
    scope.userId,
    scope.projectId,
    scope.agentProfileId,
    scope.hostId,
    scope.toolId
  ].filter(Boolean);

  return parts.join(" / ");
}

function validityLabel(memory: MemoryRecord) {
  if (memory.validity.validUntil) {
    return `${formatDate(memory.validity.validFrom)} -> ${formatDate(memory.validity.validUntil)}`;
  }

  return `From ${formatDate(memory.validity.validFrom)}`;
}

function toInputDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function fromInputDate(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
