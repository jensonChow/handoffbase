create extension if not exists vector;

create table if not exists memories (
  id uuid primary key,
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
      'agent_observation',
      'run_reflection',
      'manual_import',
      'external_content',
      'tool_result'
    )
  ),
  status text not null default 'active' check (
    status in ('active', 'pending', 'expired', 'superseded', 'deleted')
  ),
  confidence numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  importance numeric not null default 0.5 check (importance >= 0 and importance <= 1),
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes uuid[] not null default '{}',
  superseded_by uuid references memories(id) on delete set null,
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
  memory_id uuid primary key references memories(id) on delete cascade,
  embedding vector(1536),
  embedding_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists memory_embeddings_vector_idx
  on memory_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists memory_events (
  id uuid primary key,
  tenant_id text not null,
  memory_id uuid references memories(id) on delete set null,
  run_id uuid,
  trace_id uuid,
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
  id uuid primary key,
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
  id uuid primary key,
  tenant_id text not null,
  run_id uuid references runs(id) on delete set null,
  query text,
  selected_memory_ids uuid[] not null default '{}',
  ignored_memory_ids uuid[] not null default '{}',
  context_pack text,
  selection_reasons jsonb not null default '{}',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists memory_traces_tenant_created_idx
  on memory_traces (tenant_id, created_at desc);
