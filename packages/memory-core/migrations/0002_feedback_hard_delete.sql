-- Preserve durable tombstone references after a memory row is physically removed.
alter table memory_events
  drop constraint if exists memory_events_memory_id_fkey;

alter table memory_conflicts
  drop constraint if exists memory_conflicts_candidate_memory_id_fkey;

alter table memory_conflicts
  drop constraint if exists memory_conflicts_existing_memory_id_fkey;

alter table memories
  drop constraint if exists memories_superseded_by_fkey;

create table if not exists memory_feedback (
  id text primary key,
  tenant_id text not null,
  user_id text not null,
  agent_profile_id text,
  project_id text,
  host_id text,
  session_id text,
  tool_id text,
  memory_id text,
  trace_id text,
  run_id text,
  signal text not null check (signal in ('helpful', 'unhelpful')),
  reason text,
  correction_memory_id text,
  actor_type text not null check (actor_type in ('user', 'agent', 'system', 'dashboard', 'mcp_host')),
  actor_id text,
  regression_fixture jsonb not null default '{}',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  check (memory_id is not null or trace_id is not null)
);

create index if not exists memory_feedback_scope_created_idx
  on memory_feedback (tenant_id, user_id, project_id, agent_profile_id, host_id, created_at desc);

create index if not exists memory_feedback_memory_idx
  on memory_feedback (memory_id, created_at desc);

create index if not exists memory_feedback_trace_idx
  on memory_feedback (trace_id, created_at desc);
