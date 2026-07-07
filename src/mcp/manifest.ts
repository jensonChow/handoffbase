export const toolRegistrations = [
  {
    name: "continuity_bootstrap",
    title: "Continuity Bootstrap",
    description: "Build a compact continuity context pack for a new session.",
  },
  {
    name: "memory_recall",
    title: "Memory Recall",
    description: "Recall relevant memories for a task, query, and scope.",
  },
  {
    name: "memory_remember",
    title: "Memory Remember",
    description: "Create durable memory candidates from corrections, notes, or observations.",
  },
  {
    name: "memory_reflect",
    title: "Memory Reflect",
    description: "Reflect on a completed agent run and propose durable memories.",
  },
  {
    name: "memory_update",
    title: "Memory Update",
    description: "Edit, merge, or supersede an existing memory record.",
  },
  {
    name: "memory_forget",
    title: "Memory Forget",
    description: "Invalidate, archive, expire, or delete an existing memory record.",
  },
  {
    name: "memory_trace",
    title: "Memory Trace",
    description: "Explain which memories were used, ignored, or excluded.",
  },
] as const;

export const resourceRegistrations = [
  {
    name: "user-profile",
    title: "User Profile Memory",
    uriTemplate: "memory://users/{user_id}/profile",
    description: "Readable continuity profile for a user.",
  },
  {
    name: "agent-procedures",
    title: "Agent Procedures",
    uriTemplate: "memory://agents/{agent_profile_id}/procedures",
    description: "Procedure memories scoped to an agent profile.",
  },
  {
    name: "agent-failures",
    title: "Agent Failures",
    uriTemplate: "memory://agents/{agent_profile_id}/failures",
    description: "Failure memories scoped to an agent profile.",
  },
  {
    name: "project-facts",
    title: "Project Facts",
    uriTemplate: "memory://projects/{project_id}/facts",
    description: "Project fact memories.",
  },
  {
    name: "project-tool-notes",
    title: "Project Tool Notes",
    uriTemplate: "memory://projects/{project_id}/tool-notes",
    description: "Tool memories scoped to a project.",
  },
  {
    name: "run-summary",
    title: "Run Summary",
    uriTemplate: "memory://runs/{run_id}/summary",
    description: "Summary for a remembered agent run.",
  },
  {
    name: "memory-trace",
    title: "Memory Trace",
    uriTemplate: "memory://traces/{trace_id}",
    description: "Trace detail for memory selection and exclusion.",
  },
  {
    name: "vault-pending",
    title: "Pending Memories",
    uriTemplate: "memory://vault/pending",
    description: "Pending memory candidates awaiting review.",
  },
  {
    name: "vault-conflicts",
    title: "Memory Conflicts",
    uriTemplate: "memory://vault/conflicts",
    description: "Memory conflicts awaiting resolution.",
  },
] as const;

export const promptRegistrations = [
  {
    name: "memory-aware-start",
    title: "Memory Aware Start",
    description: "Start a session by bootstrapping continuity context before acting.",
  },
  {
    name: "post-run-reflection",
    title: "Post Run Reflection",
    description: "Review a completed run and identify durable memories.",
  },
  {
    name: "memory-review",
    title: "Memory Review",
    description: "Guide a user through pending memory review decisions.",
  },
  {
    name: "conflict-resolution",
    title: "Conflict Resolution",
    description: "Resolve conflicts between existing and proposed memories.",
  },
] as const;

export function registrationManifest() {
  return {
    tools: toolRegistrations.map((tool) => tool.name),
    resources: resourceRegistrations.map((resource) => resource.uriTemplate),
    prompts: promptRegistrations.map((prompt) => prompt.name),
  };
}
