create extension if not exists vector;

create table if not exists memories (
  id text primary key,
  tenant_id text not null,
  user_id text not null,
  agent_profile_id text,
  project_id text,
  host_id text,
  session_id text,
  tool_id text,
  type text not null check (
    type in (
      'identity',
      'user_preference',
      'procedure',
      'project_fact',
      'tool_memory',
      'decision_memory',
      'failure_memory',
      'outcome_memory',
      'negative_preference',
      'skill'
    )
  ),
  canonical_text text not null check (length(canonical_text) > 0 and length(canonical_text) <= 4000),
  raw_source text check (raw_source is null or length(raw_source) <= 8000),
  source_kind text not null check (
    source_kind in (
      'user_assertion',
      'user_correction',
      'user_instruction',
      'user_statement',
      'agent_observation',
      'run_reflection',
      'post_run_reflection',
      'run_summary',
      'decision_record',
      'manual_import',
      'manual_edit',
      'external_content',
      'external_web',
      'mcp_tool_description',
      'tool_result'
    )
  ),
  status text not null default 'active' check (
    status in (
      'active',
      'pending',
      'rejected',
      'expired',
      'superseded',
      'invalidated',
      'archived',
      'deleted'
    )
  ),
  confidence numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  importance numeric not null default 0.5 check (importance >= 0 and importance <= 1),
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes text[] not null default '{}',
  superseded_by text references memories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  metadata jsonb not null default '{}',
  check (valid_until is null or valid_from is null or valid_until > valid_from),
  check (status <> 'superseded' or superseded_by is not null)
);

create index if not exists memories_scope_idx
  on memories (tenant_id, user_id, project_id, agent_profile_id, host_id, tool_id);

create index if not exists memories_status_validity_idx
  on memories (status, valid_until);

create index if not exists memories_type_idx
  on memories (type);

create table if not exists memory_embeddings (
  memory_id text primary key references memories(id) on delete cascade,
  embedding vector(1536),
  embedding_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists memory_embeddings_vector_idx
  on memory_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists memory_events (
  id text primary key,
  tenant_id text not null,
  memory_id text references memories(id) on delete set null,
  run_id text,
  trace_id text,
  event_type text not null check (
    event_type in ('add', 'update', 'delete', 'recall', 'supersede', 'expire', 'approve', 'reject')
  ),
  actor_type text not null check (actor_type in ('user', 'agent', 'system', 'dashboard', 'mcp_host')),
  actor_id text,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  check (event_type = 'recall' or memory_id is not null)
);

create index if not exists memory_events_tenant_created_idx
  on memory_events (tenant_id, created_at desc);

create index if not exists memory_events_memory_idx
  on memory_events (memory_id, created_at desc);

create table if not exists runs (
  id text primary key,
  tenant_id text not null,
  user_id text not null,
  host_id text,
  agent_profile_id text,
  project_id text,
  task_hint text,
  summary text,
  outcome text,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'
);

create index if not exists runs_scope_idx
  on runs (tenant_id, user_id, project_id, agent_profile_id, host_id);

create table if not exists memory_traces (
  id text primary key,
  tenant_id text not null,
  run_id text references runs(id) on delete set null,
  query text,
  selected_memory_ids text[] not null default '{}',
  ignored_memory_ids text[] not null default '{}',
  context_pack text,
  selection_reasons jsonb not null default '{}',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists memory_traces_tenant_created_idx
  on memory_traces (tenant_id, created_at desc);

create table if not exists memory_conflicts (
  id text primary key,
  tenant_id text not null,
  candidate_memory_id text references memories(id) on delete set null,
  existing_memory_id text references memories(id) on delete set null,
  conflict_type text not null check (
    conflict_type in ('contradiction', 'supersedes', 'duplicate', 'scope_overlap', 'none')
  ),
  severity text not null check (severity in ('low', 'medium', 'high')),
  recommended_action text not null check (
    recommended_action in ('accept', 'ignore', 'merge', 'supersede', 'supersede_existing', 'ask_user', 'keep_both', 'reject')
  ),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reason text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  resolution jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}',
  check (candidate_memory_id is not null or existing_memory_id is not null),
  check (status = 'open' or resolved_at is not null)
);

create index if not exists memory_conflicts_tenant_status_created_idx
  on memory_conflicts (tenant_id, status, created_at desc);

create index if not exists memory_conflicts_candidate_idx
  on memory_conflicts (candidate_memory_id);

create index if not exists memory_conflicts_existing_idx
  on memory_conflicts (existing_memory_id);
