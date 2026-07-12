import type { MemoryReasoningProvider } from "../provider.js";
import { sanitizeProviderInput } from "../input-sanitizer.js";
import { buildProviderPrompt } from "../prompts.js";
import {
  StructuredOutputParseError,
  StructuredOutputValidationError,
  validateProviderOutput
} from "../structured-output.js";
import type {
  ClassifiedMemory,
  ClassifyMemoryInput,
  ConflictInput,
  ConflictResult,
  ContextPack,
  ContextPackInput,
  ExtractMemoryInput,
  MemoryScope,
  MemoryCandidate,
  ProviderMethod,
  ReflectRunInput,
  ReflectionResult,
  SourceTrust,
  TraceExplanation,
  TraceInput
} from "../types.js";

export interface QwenMemoryProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class QwenProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "QwenProviderError";
    this.status = status;
  }
}

export class QwenMemoryProvider implements MemoryReasoningProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: QwenMemoryProviderOptions = {}) {
    if (!options.apiKey) {
      throw new QwenProviderError("Qwen API key is required. Set QWEN_API_KEY or DASHSCOPE_API_KEY.");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    this.model = options.model ?? "qwen-plus";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  static fromEnv(env: Record<string, string | undefined> = process.env): QwenMemoryProvider {
    return new QwenMemoryProvider({
      apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
      baseUrl: env.QWEN_BASE_URL ?? env.DASHSCOPE_BASE_URL,
      model: env.QWEN_MODEL ?? env.DASHSCOPE_MODEL,
      timeoutMs: env.QWEN_TIMEOUT_MS ? Number(env.QWEN_TIMEOUT_MS) : undefined
    });
  }

  async extractMemories(input: ExtractMemoryInput): Promise<MemoryCandidate[]> {
    return await this.callStructured("extractMemories", input, {
      fallbackScope: input.scopes,
      sourceKind: input.sourceKind,
      sourceTrust: input.sourceTrust,
      approvalMode: input.approvalMode
    }) as MemoryCandidate[];
  }

  async classifyMemory(input: ClassifyMemoryInput): Promise<ClassifiedMemory> {
    return await this.callStructured("classifyMemory", input, {
      fallbackScope: input.scopes,
      sourceKind: input.sourceKind,
      sourceTrust: input.sourceTrust
    }) as ClassifiedMemory;
  }

  async detectConflicts(input: ConflictInput): Promise<ConflictResult> {
    return await this.callStructured("detectConflicts", input, {
      fallbackScope: input.candidate.scope,
      sourceKind: input.candidate.sourceKind,
      sourceTrust: input.candidate.sourceTrust
    }) as ConflictResult;
  }

  async buildContextPack(input: ContextPackInput): Promise<ContextPack> {
    return await this.callStructured("buildContextPack", input, {
      fallbackScope: input.scopes
    }) as ContextPack;
  }

  async reflectRun(input: ReflectRunInput): Promise<ReflectionResult> {
    return await this.callStructured("reflectRun", input, {
      fallbackScope: input.scopes,
      sourceKind: "run_summary",
      sourceTrust: input.sourceTrust ?? "internal_run"
    }) as ReflectionResult;
  }

  async explainMemoryUsage(input: TraceInput): Promise<TraceExplanation> {
    return await this.callStructured("explainMemoryUsage", input, {
      fallbackScope: input.scopes
    }) as TraceExplanation;
  }

  private async callStructured(
    method: ProviderMethod,
    input: unknown,
    context: {
      fallbackScope?: MemoryScope;
      sourceKind?: ExtractMemoryInput["sourceKind"];
      sourceTrust?: SourceTrust;
      approvalMode?: "active" | "pending";
    }
  ): Promise<unknown> {
    const raw = await this.completeJson(method, input);
    try {
      return validateProviderOutput(method, raw, context);
    } catch (error) {
      if (error instanceof StructuredOutputParseError || error instanceof StructuredOutputValidationError) {
        throw error;
      }
      throw new StructuredOutputValidationError(`Failed to validate ${method} output.`);
    }
  }

  private async completeJson(method: ProviderMethod, input: unknown): Promise<string> {
    const prompt = buildProviderPrompt(method, sanitizeProviderInput(input));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.chatCompletionsEndpoint(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ]
        }),
        signal: controller.signal
      });

      const text = await response.text();
      if (!response.ok) {
        throw new QwenProviderError(`Qwen request failed with HTTP ${response.status}: ${sanitizeForError(text, this.apiKey)}`, response.status);
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new QwenProviderError("Qwen response was not valid JSON.");
      }

      const content = readChoiceContent(payload);
      if (!content) {
        throw new QwenProviderError("Qwen response did not include choices[0].message.content.");
      }

      return content;
    } catch (error) {
      if (error instanceof QwenProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new QwenProviderError(`Qwen request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private chatCompletionsEndpoint(): string {
    const normalized = this.baseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/chat/completions")) {
      return normalized;
    }
    return `${normalized}/chat/completions`;
  }
}

function readChoiceContent(payload: Record<string, unknown>): string | undefined {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const first = choices[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }

  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : undefined;
}

function truncate(value: string, maxLength = 500): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeForError(value: string, apiKey: string): string {
  return truncate(value.replaceAll(apiKey, "[REDACTED_QWEN_API_KEY]"));
}
