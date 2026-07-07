import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  continuityBootstrapInputShape,
  continuityBootstrapOutputShape,
  memoryForgetInputShape,
  memoryForgetOutputShape,
  memoryRecallInputShape,
  memoryRecallOutputShape,
  memoryReflectInputShape,
  memoryReflectOutputShape,
  memoryRememberInputShape,
  memoryRememberOutputShape,
  memoryTraceInputShape,
  memoryTraceOutputShape,
  memoryUpdateInputShape,
  memoryUpdateOutputShape,
} from "../schemas.js";
import type { MemoryService } from "../services/memory-service.js";
import { promptRegistrations, resourceRegistrations, toolRegistrations } from "./manifest.js";

type ToolPayload = Record<string, unknown>;

function structuredToolResult<T extends ToolPayload>(payload: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

function normalizeVariables(variables: Record<string, string | string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value]),
  );
}

function toolMetadata(name: (typeof toolRegistrations)[number]["name"]) {
  const metadata = toolRegistrations.find((tool) => tool.name === name);
  if (!metadata) {
    throw new Error(`Missing MCP tool metadata for ${name}`);
  }
  return metadata;
}

export function registerContinuityMcp(server: McpServer, service: MemoryService): void {
  const bootstrap = toolMetadata("continuity_bootstrap");
  server.registerTool(
    bootstrap.name,
    {
      title: bootstrap.title,
      description: bootstrap.description,
      inputSchema: continuityBootstrapInputShape,
      outputSchema: continuityBootstrapOutputShape,
    },
    async (input) => structuredToolResult(await service.continuityBootstrap(input)),
  );

  const recall = toolMetadata("memory_recall");
  server.registerTool(
    recall.name,
    {
      title: recall.title,
      description: recall.description,
      inputSchema: memoryRecallInputShape,
      outputSchema: memoryRecallOutputShape,
    },
    async (input) => structuredToolResult(await service.recall(input)),
  );

  const remember = toolMetadata("memory_remember");
  server.registerTool(
    remember.name,
    {
      title: remember.title,
      description: remember.description,
      inputSchema: memoryRememberInputShape,
      outputSchema: memoryRememberOutputShape,
    },
    async (input) => structuredToolResult(await service.remember(input)),
  );

  const reflect = toolMetadata("memory_reflect");
  server.registerTool(
    reflect.name,
    {
      title: reflect.title,
      description: reflect.description,
      inputSchema: memoryReflectInputShape,
      outputSchema: memoryReflectOutputShape,
    },
    async (input) => structuredToolResult(await service.reflect(input)),
  );

  const update = toolMetadata("memory_update");
  server.registerTool(
    update.name,
    {
      title: update.title,
      description: update.description,
      inputSchema: memoryUpdateInputShape,
      outputSchema: memoryUpdateOutputShape,
    },
    async (input) => structuredToolResult(await service.update(input)),
  );

  const forget = toolMetadata("memory_forget");
  server.registerTool(
    forget.name,
    {
      title: forget.title,
      description: forget.description,
      inputSchema: memoryForgetInputShape,
      outputSchema: memoryForgetOutputShape,
    },
    async (input) => structuredToolResult(await service.forget(input)),
  );

  const trace = toolMetadata("memory_trace");
  server.registerTool(
    trace.name,
    {
      title: trace.title,
      description: trace.description,
      inputSchema: memoryTraceInputShape,
      outputSchema: memoryTraceOutputShape,
    },
    async (input) => structuredToolResult(await service.trace(input)),
  );

  for (const resource of resourceRegistrations) {
    const metadata = {
      title: resource.title,
      description: resource.description,
      mimeType: "application/json",
    };

    if (!resource.uriTemplate.includes("{")) {
      server.registerResource(resource.name, resource.uriTemplate, metadata, async (uri) => {
        const result = await service.readResource({
          name: resource.name,
          uri: uri.toString(),
          variables: {},
        });

        return {
          contents: [
            {
              uri: result.uri,
              mimeType: result.mimeType,
              text: result.text,
            },
          ],
        };
      });
      continue;
    }

    server.registerResource(
      resource.name,
      new ResourceTemplate(resource.uriTemplate, { list: undefined }),
      metadata,
      async (uri, variables) => {
        const result = await service.readResource({
          name: resource.name,
          uri: uri.toString(),
          variables: normalizeVariables(variables),
        });

        return {
          contents: [
            {
              uri: result.uri,
              mimeType: result.mimeType,
              text: result.text,
            },
          ],
        };
      },
    );
  }

  registerPrompts(server);
}

function registerPrompts(server: McpServer): void {
  const memoryAwareStart = promptRegistrations.find((prompt) => prompt.name === "memory-aware-start");
  server.registerPrompt(
    "memory-aware-start",
    {
      title: memoryAwareStart?.title,
      description: memoryAwareStart?.description,
      argsSchema: {
        host: z.string().optional(),
        agent_profile: z.string().optional(),
        user_id: z.string().optional(),
        project_id: z.string().optional(),
        task_hint: z.string().optional(),
        token_budget: z.string().optional(),
      },
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Start this session with Agent Continuity memory.",
              "Call continuity_bootstrap before taking task-specific action.",
              `Host: ${args.host ?? "unknown"}`,
              `Agent profile: ${args.agent_profile ?? "unknown"}`,
              `User: ${args.user_id ?? "unknown"}`,
              `Project: ${args.project_id ?? "unknown"}`,
              `Task hint: ${args.task_hint ?? "not provided"}`,
              `Token budget: ${args.token_budget ?? "default"}`,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  const postRunReflection = promptRegistrations.find((prompt) => prompt.name === "post-run-reflection");
  server.registerPrompt(
    "post-run-reflection",
    {
      title: postRunReflection?.title,
      description: postRunReflection?.description,
      argsSchema: {
        run_id: z.string().optional(),
        summary: z.string().optional(),
        outcome: z.string().optional(),
      },
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Review the completed run for durable continuity memory.",
              "Call memory_reflect with concise summary, outcome, useful tool lessons, failures, decisions, and user corrections.",
              `Run: ${args.run_id ?? "unknown"}`,
              `Summary: ${args.summary ?? "not provided"}`,
              `Outcome: ${args.outcome ?? "not provided"}`,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  const memoryReview = promptRegistrations.find((prompt) => prompt.name === "memory-review");
  server.registerPrompt(
    "memory-review",
    {
      title: memoryReview?.title,
      description: memoryReview?.description,
      argsSchema: {
        review_scope: z.string().optional(),
        status: z.string().optional(),
      },
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Review pending or active memories with the user.",
              "Use memory://vault/pending or memory://vault/conflicts when appropriate, then call memory_update, memory_forget, or memory_remember for confirmed changes.",
              `Scope: ${args.review_scope ?? "default"}`,
              `Status filter: ${args.status ?? "pending"}`,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  const conflictResolution = promptRegistrations.find((prompt) => prompt.name === "conflict-resolution");
  server.registerPrompt(
    "conflict-resolution",
    {
      title: conflictResolution?.title,
      description: conflictResolution?.description,
      argsSchema: {
        conflict_id: z.string().optional(),
        existing_memory: z.string().optional(),
        proposed_memory: z.string().optional(),
      },
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Resolve the memory conflict by asking for a clear user decision.",
              "Do not silently overwrite durable memory. Use memory_update only after the resolution is explicit.",
              `Conflict: ${args.conflict_id ?? "unknown"}`,
              `Existing memory: ${args.existing_memory ?? "not provided"}`,
              `Proposed memory: ${args.proposed_memory ?? "not provided"}`,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
