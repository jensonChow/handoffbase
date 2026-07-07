export type MemoryType =
  | "identity"
  | "user_preference"
  | "procedure"
  | "project_fact"
  | "tool_memory"
  | "decision_memory"
  | "failure_memory"
  | "outcome_memory"
  | "negative_preference"
  | "skill";

export type MemoryStatus =
  | "active"
  | "pending"
  | "invalidated"
  | "expired"
  | "superseded";

export type SourceKind =
  | "user_correction"
  | "run_reflection"
  | "manual_edit"
  | "memory_recall"
  | "import";

export type MemoryScope = {
  userId: string;
  agentProfileId?: string;
  hostId?: string;
  projectId?: string;
  toolId?: string;
};

export type MemoryValidity = {
  validFrom: string;
  validUntil?: string;
  reason?: string;
};

export type MemoryRecord = {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  source: {
    kind: SourceKind;
    label: string;
    runId?: string;
  };
  status: MemoryStatus;
  confidence: number;
  importance: number;
  validity: MemoryValidity;
  canonicalText: string;
  rawSource?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
  eventCount: number;
  supersedes?: string[];
  supersededBy?: string;
  metadata: Record<string, string | number | boolean>;
};

export type MemoryEvent = {
  id: string;
  memoryId: string;
  eventType: "created" | "approved" | "updated" | "invalidated" | "deleted" | "recalled";
  actorType: "user" | "agent" | "system";
  actorId: string;
  reason: string;
  createdAt: string;
};

export type TraceMemoryRef = {
  memoryId: string;
  text: string;
  type: MemoryType;
  score?: number;
  reason: string;
};

export type MemoryTrace = {
  id: string;
  runId: string;
  query: string;
  hostId: string;
  agentProfileId: string;
  createdAt: string;
  contextPack: string;
  usedMemories: TraceMemoryRef[];
  ignoredMemories: TraceMemoryRef[];
  excludedMemories: TraceMemoryRef[];
};

export type ConflictCandidate = {
  id: string;
  status: "needs_review" | "placeholder";
  incoming: string;
  existing: string;
  recommendation: string;
  memoryType: MemoryType;
  scopeLabel: string;
};

export type DashboardSnapshot = {
  memories: MemoryRecord[];
  events: MemoryEvent[];
  traces: MemoryTrace[];
  conflicts: ConflictCandidate[];
};

export type MemoryPatch = Partial<
  Pick<
    MemoryRecord,
    "type" | "status" | "confidence" | "importance" | "canonicalText" | "validity"
  >
>;

export interface MemoryClient {
  listDashboard(): Promise<DashboardSnapshot>;
  updateMemory(memoryId: string, patch: MemoryPatch): Promise<MemoryRecord>;
  approveMemory(memoryId: string): Promise<MemoryRecord>;
  invalidateMemory(memoryId: string, reason: string): Promise<MemoryRecord>;
  deleteMemory(memoryId: string, reason: string): Promise<void>;
}

const now = "2026-07-07T00:30:00.000Z";

let memories: MemoryRecord[] = [
  {
    id: "mem_user_pref_001",
    type: "user_preference",
    scope: {
      userId: "user_demo",
      agentProfileId: "opportunity-scout",
      hostId: "codex"
    },
    source: {
      kind: "user_correction",
      label: "Session 1 preference correction",
      runId: "run_2026_0706_01"
    },
    status: "active",
    confidence: 0.96,
    importance: 0.9,
    validity: {
      validFrom: "2026-07-06T10:12:00.000Z",
      reason: "Confirmed directly by the user."
    },
    canonicalText:
      "User prioritizes AI hackathons that improve credentials, founder network, and useful startup resources over prize money alone.",
    rawSource:
      "I want AI hackathons that improve credentials and network, not only prize money.",
    createdAt: "2026-07-06T10:15:00.000Z",
    updatedAt: "2026-07-06T10:21:00.000Z",
    lastUsedAt: "2026-07-06T13:50:00.000Z",
    useCount: 7,
    eventCount: 4,
    metadata: {
      provider: "qwen",
      approvalMode: "user_confirmed"
    }
  },
  {
    id: "mem_proc_002",
    type: "procedure",
    scope: {
      userId: "user_demo",
      agentProfileId: "opportunity-scout",
      projectId: "ai-event-2026"
    },
    source: {
      kind: "run_reflection",
      label: "Post-run reflection",
      runId: "run_2026_0706_02"
    },
    status: "active",
    confidence: 0.93,
    importance: 0.88,
    validity: {
      validFrom: "2026-07-06T11:00:00.000Z",
      reason: "Repeated failure prevention procedure."
    },
    canonicalText:
      "Before recommending a hackathon, verify registration deadline, timezone, eligibility region, and official rules.",
    createdAt: "2026-07-06T11:05:00.000Z",
    updatedAt: "2026-07-06T11:05:00.000Z",
    lastUsedAt: "2026-07-06T14:10:00.000Z",
    useCount: 5,
    eventCount: 3,
    metadata: {
      provider: "qwen",
      policyGate: "approved"
    }
  },
  {
    id: "mem_tool_003",
    type: "tool_memory",
    scope: {
      userId: "user_demo",
      agentProfileId: "opportunity-scout",
      toolId: "devpost"
    },
    source: {
      kind: "run_reflection",
      label: "Devpost inspection result",
      runId: "run_2026_0706_02"
    },
    status: "active",
    confidence: 0.86,
    importance: 0.67,
    validity: {
      validFrom: "2026-07-06T11:42:00.000Z",
      reason: "Tool behavior observed during current demo data collection."
    },
    canonicalText:
      "Devpost deadlines are often shown in Pacific Time; convert them before comparing against Asia/Shanghai planning dates.",
    createdAt: "2026-07-06T11:45:00.000Z",
    updatedAt: "2026-07-06T11:45:00.000Z",
    lastUsedAt: "2026-07-06T14:00:00.000Z",
    useCount: 3,
    eventCount: 2,
    metadata: {
      provider: "qwen",
      tool: "devpost"
    }
  },
  {
    id: "mem_pending_004",
    type: "failure_memory",
    scope: {
      userId: "user_demo",
      agentProfileId: "opportunity-scout",
      projectId: "ai-event-2026"
    },
    source: {
      kind: "run_reflection",
      label: "Eligibility mistake reflection",
      runId: "run_2026_0706_03"
    },
    status: "pending",
    confidence: 0.82,
    importance: 0.78,
    validity: {
      validFrom: "2026-07-06T15:20:00.000Z",
      reason: "Needs user approval because it changes future recommendations."
    },
    canonicalText:
      "Do not recommend competitions when official eligibility excludes the user's region; verify rules before ranking.",
    rawSource:
      "The user corrected a recommendation because the event did not allow China or Hong Kong participation.",
    createdAt: "2026-07-06T15:24:00.000Z",
    updatedAt: "2026-07-06T15:24:00.000Z",
    useCount: 0,
    eventCount: 1,
    metadata: {
      provider: "qwen",
      approvalMode: "pending"
    }
  },
  {
    id: "mem_pending_005",
    type: "project_fact",
    scope: {
      userId: "user_demo",
      projectId: "agent-continuity-mcp",
      hostId: "codex"
    },
    source: {
      kind: "manual_edit",
      label: "Dashboard planning note"
    },
    status: "pending",
    confidence: 0.74,
    importance: 0.56,
    validity: {
      validFrom: now,
      reason: "Drafted from implementation notes."
    },
    canonicalText:
      "The dashboard should expose Memory Vault, pending review, edit/delete actions, memory trace, and conflict review.",
    createdAt: now,
    updatedAt: now,
    useCount: 0,
    eventCount: 1,
    metadata: {
      approvalMode: "pending"
    }
  },
  {
    id: "mem_expired_006",
    type: "decision_memory",
    scope: {
      userId: "user_demo",
      agentProfileId: "opportunity-scout"
    },
    source: {
      kind: "run_reflection",
      label: "Superseded prioritization note",
      runId: "run_2026_0705_01"
    },
    status: "superseded",
    confidence: 0.69,
    importance: 0.3,
    validity: {
      validFrom: "2026-07-05T08:00:00.000Z",
      validUntil: "2026-07-06T10:15:00.000Z",
      reason: "Superseded by stronger user preference memory."
    },
    canonicalText:
      "User appears to prioritize hackathon prize money when choosing opportunities.",
    createdAt: "2026-07-05T08:20:00.000Z",
    updatedAt: "2026-07-06T10:20:00.000Z",
    useCount: 1,
    eventCount: 5,
    supersededBy: "mem_user_pref_001",
    metadata: {
      provider: "qwen"
    }
  }
];

let events: MemoryEvent[] = [
  {
    id: "evt_001",
    memoryId: "mem_user_pref_001",
    eventType: "created",
    actorType: "agent",
    actorId: "opportunity-scout",
    reason: "Extracted durable user preference from correction.",
    createdAt: "2026-07-06T10:15:00.000Z"
  },
  {
    id: "evt_002",
    memoryId: "mem_user_pref_001",
    eventType: "approved",
    actorType: "user",
    actorId: "user_demo",
    reason: "User confirmed this ranking criterion.",
    createdAt: "2026-07-06T10:21:00.000Z"
  },
  {
    id: "evt_003",
    memoryId: "mem_proc_002",
    eventType: "created",
    actorType: "agent",
    actorId: "qwen-provider",
    reason: "Generated after post-run reflection.",
    createdAt: "2026-07-06T11:05:00.000Z"
  },
  {
    id: "evt_004",
    memoryId: "mem_proc_002",
    eventType: "recalled",
    actorType: "system",
    actorId: "memory_recall",
    reason: "Selected for context pack trace_0706_02.",
    createdAt: "2026-07-06T14:10:00.000Z"
  },
  {
    id: "evt_005",
    memoryId: "mem_pending_004",
    eventType: "created",
    actorType: "agent",
    actorId: "qwen-provider",
    reason: "Candidate failure memory requires review.",
    createdAt: "2026-07-06T15:24:00.000Z"
  },
  {
    id: "evt_006",
    memoryId: "mem_expired_006",
    eventType: "invalidated",
    actorType: "system",
    actorId: "conflict-check",
    reason: "Superseded by mem_user_pref_001.",
    createdAt: "2026-07-06T10:20:00.000Z"
  }
];

const traces: MemoryTrace[] = [
  {
    id: "trace_0706_02",
    runId: "run_2026_0706_02",
    query: "Rank Qwen, TRAE, and CockroachDB opportunities for this user.",
    hostId: "codex",
    agentProfileId: "opportunity-scout",
    createdAt: "2026-07-06T14:10:00.000Z",
    contextPack:
      "Use confirmed preference for AI agent or memory-focused hackathons. Prioritize credentials, network, and startup resources. Verify deadlines, eligibility region, official rules, and timezone before ranking.",
    usedMemories: [
      {
        memoryId: "mem_user_pref_001",
        text: "User prioritizes AI hackathons that improve credentials, founder network, and useful startup resources over prize money alone.",
        type: "user_preference",
        score: 0.92,
        reason: "Directly determines ranking criteria."
      },
      {
        memoryId: "mem_proc_002",
        text: "Before recommending a hackathon, verify registration deadline, timezone, eligibility region, and official rules.",
        type: "procedure",
        score: 0.88,
        reason: "Required safety check before producing recommendations."
      }
    ],
    ignoredMemories: [
      {
        memoryId: "mem_tool_003",
        text: "Devpost deadlines are often shown in Pacific Time.",
        type: "tool_memory",
        score: 0.44,
        reason: "No Devpost page was used in this run."
      }
    ],
    excludedMemories: [
      {
        memoryId: "mem_expired_006",
        text: "User appears to prioritize hackathon prize money when choosing opportunities.",
        type: "decision_memory",
        score: 0.12,
        reason: "Superseded by a directly confirmed preference."
      }
    ]
  },
  {
    id: "trace_0706_03",
    runId: "run_2026_0706_03",
    query: "Reflect on a recommendation that failed eligibility checks.",
    hostId: "claude-code",
    agentProfileId: "opportunity-scout",
    createdAt: "2026-07-06T15:24:00.000Z",
    contextPack:
      "The user cares about region eligibility. Convert event deadlines to the planning timezone and record failure memories as pending until reviewed.",
    usedMemories: [
      {
        memoryId: "mem_proc_002",
        text: "Before recommending a hackathon, verify registration deadline, timezone, eligibility region, and official rules.",
        type: "procedure",
        score: 0.9,
        reason: "Matched the failed recommendation pattern."
      }
    ],
    ignoredMemories: [],
    excludedMemories: []
  }
];

const conflicts: ConflictCandidate[] = [
  {
    id: "conflict_001",
    status: "needs_review",
    incoming:
      "User now prioritizes founder network and resource access above prize money.",
    existing:
      "User appears to prioritize hackathon prize money when choosing opportunities.",
    recommendation:
      "Supersede the older decision memory and keep the new user preference active.",
    memoryType: "user_preference",
    scopeLabel: "user_demo / opportunity-scout"
  },
  {
    id: "conflict_placeholder",
    status: "placeholder",
    incoming: "Conflict detection endpoint is not wired yet.",
    existing: "Backend will provide candidate pairs from Qwen conflict checks.",
    recommendation:
      "This panel is ready for the future conflict review API response.",
    memoryType: "procedure",
    scopeLabel: "all scopes"
  }
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function delay() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 240);
  });
}

function appendEvent(event: Omit<MemoryEvent, "id" | "createdAt">) {
  events = [
    {
      ...event,
      id: `evt_${String(events.length + 1).padStart(3, "0")}`,
      createdAt: new Date().toISOString()
    },
    ...events
  ];
}

function findMemory(memoryId: string) {
  const memory = memories.find((item) => item.id === memoryId);

  if (!memory) {
    throw new Error(`Memory ${memoryId} was not found.`);
  }

  return memory;
}

export function createMockMemoryClient(): MemoryClient {
  return {
    async listDashboard() {
      await delay();

      return clone({
        memories,
        events,
        traces,
        conflicts
      });
    },

    async updateMemory(memoryId, patch) {
      await delay();
      const memory = findMemory(memoryId);
      const updated: MemoryRecord = {
        ...memory,
        ...patch,
        validity: patch.validity ?? memory.validity,
        updatedAt: new Date().toISOString(),
        eventCount: memory.eventCount + 1
      };

      memories = memories.map((item) => (item.id === memoryId ? updated : item));
      appendEvent({
        memoryId,
        eventType: "updated",
        actorType: "user",
        actorId: "dashboard",
        reason: "Edited from Memory Vault dashboard."
      });

      return clone(updated);
    },

    async approveMemory(memoryId) {
      await delay();
      const memory = findMemory(memoryId);
      const updated: MemoryRecord = {
        ...memory,
        status: "active",
        updatedAt: new Date().toISOString(),
        eventCount: memory.eventCount + 1
      };

      memories = memories.map((item) => (item.id === memoryId ? updated : item));
      appendEvent({
        memoryId,
        eventType: "approved",
        actorType: "user",
        actorId: "dashboard",
        reason: "Approved from Pending Memories review."
      });

      return clone(updated);
    },

    async invalidateMemory(memoryId, reason) {
      await delay();
      const memory = findMemory(memoryId);
      const updated: MemoryRecord = {
        ...memory,
        status: "invalidated",
        validity: {
          ...memory.validity,
          validUntil: new Date().toISOString(),
          reason
        },
        updatedAt: new Date().toISOString(),
        eventCount: memory.eventCount + 1
      };

      memories = memories.map((item) => (item.id === memoryId ? updated : item));
      appendEvent({
        memoryId,
        eventType: "invalidated",
        actorType: "user",
        actorId: "dashboard",
        reason
      });

      return clone(updated);
    },

    async deleteMemory(memoryId, reason) {
      await delay();
      findMemory(memoryId);
      memories = memories.filter((item) => item.id !== memoryId);
      appendEvent({
        memoryId,
        eventType: "deleted",
        actorType: "user",
        actorId: "dashboard",
        reason
      });
    }
  };
}
