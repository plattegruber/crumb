// ---------------------------------------------------------------------------
// AI Recipe Extraction Agent (SPEC SS7)
// ---------------------------------------------------------------------------
// An agent loop that uses Workers AI with tool calling to intelligently
// extract recipes from any input (URL, text, image).
// ---------------------------------------------------------------------------

import type { Result, RecipeExtract, ImportError } from "@dough/shared";
import { ok, err } from "@dough/shared";
import type { AgentTool, FetchFn, AiRunFn } from "./tools.js";
import { createAllTools, parseExtractRecipeOutput } from "./tools.js";
import { EXTRACTION_AGENT_SYSTEM_PROMPT, buildUserMessage } from "./prompts.js";
import { runClaudeAgent } from "./anthropic.js";

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

/** Default reasoning model (Anthropic Claude). */
export const DEFAULT_REASONING_MODEL = "claude-sonnet-4-20250514";

/** Default vision model (Claude handles vision natively). */
export const DEFAULT_VISION_MODEL = "claude-sonnet-4-20250514";

/** Default transcription model (Workers AI Whisper). */
export const DEFAULT_TRANSCRIPTION_MODEL = "@cf/openai/whisper-large-v3-turbo";

/**
 * Configuration for the extraction agent.
 */
export interface AgentConfig {
  /** Workers AI run function (for Whisper transcription, optional). */
  readonly aiRunFn?: AiRunFn;
  /** Anthropic API key (preferred for reasoning). */
  readonly anthropicApiKey?: string;
  /** HTTP fetch function for making requests. */
  readonly fetchFn: FetchFn;
  /** The reasoning model to use for the agent loop. */
  readonly reasoningModel?: string;
  /** The vision model for image analysis. */
  readonly visionModel?: string;
  /** The transcription model for audio. */
  readonly transcriptionModel?: string;
  /** Maximum number of agent turns (safety limit). */
  readonly maxTurns?: number;
  /** Timeout in milliseconds for the entire agent run. */
  readonly timeoutMs?: number;
  /** Override the tools used by the agent (for testing). */
  readonly tools?: AgentTool[];
}

/**
 * Input to the extraction agent.
 */
export interface AgentInput {
  readonly type: "url" | "text" | "image";
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Workers AI message types
// ---------------------------------------------------------------------------

interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

interface AiToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface AiResponse {
  response?: string;
  tool_calls?: AiToolCall[];
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

/**
 * Run the extraction agent on the given input.
 *
 * The agent uses a tool-calling loop: on each turn it either calls a tool
 * or returns a final answer via the extract_recipe tool. The loop continues
 * until the agent calls extract_recipe or the maximum number of turns is
 * reached.
 */
export async function runExtractionAgent(
  config: AgentConfig,
  input: AgentInput,
): Promise<Result<RecipeExtract, ImportError>> {
  const visionModel = config.visionModel ?? DEFAULT_VISION_MODEL;
  const transcriptionModel = config.transcriptionModel ?? DEFAULT_TRANSCRIPTION_MODEL;
  const maxTurns = config.maxTurns ?? 30;
  const timeoutMs = config.timeoutMs ?? 300000; // 5 minutes

  // Prefer Anthropic Claude for reasoning (superior tool use)
  if (config.anthropicApiKey) {
    return runWithClaude(config, input, visionModel, transcriptionModel, maxTurns, timeoutMs);
  }

  // Fall back to Workers AI
  const reasoningModel = config.reasoningModel ?? DEFAULT_REASONING_MODEL;

  // Build tools
  const tools =
    config.tools ??
    createAllTools({
      deps: {
        fetchFn: config.fetchFn,
        aiRunFn: config.aiRunFn,
      },
      visionModel,
      transcriptionModel,
    });

  // Build tool definitions for the AI model
  const toolDefinitions = tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  // Build the tool lookup map
  const toolMap = new Map<string, AgentTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Initialize conversation
  const messages: AiMessage[] = [
    { role: "system", content: EXTRACTION_AGENT_SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(input) },
  ];

  // Set up timeout
  const startTime = Date.now();

  // Agent loop
  for (let turn = 0; turn < maxTurns; turn++) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      return err({ type: "Timeout" as const });
    }

    // Call the AI model
    let aiResponse: AiResponse;
    try {
      const rawResponse = await config.aiRunFn(reasoningModel, {
        messages,
        tools: toolDefinitions,
        max_tokens: 4096,
      });

      aiResponse = rawResponse as AiResponse;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown AI model error";
      return err({
        type: "ExtractionFailed" as const,
        reason: `AI model call failed: ${message}`,
      });
    }

    // Check if the model wants to call tools
    if (
      aiResponse.tool_calls !== undefined &&
      aiResponse.tool_calls !== null &&
      aiResponse.tool_calls.length > 0
    ) {
      // Add the assistant message with tool calls to conversation
      messages.push({
        role: "assistant",
        content: JSON.stringify({ tool_calls: aiResponse.tool_calls }),
      });

      // Process each tool call
      for (const toolCall of aiResponse.tool_calls) {
        const tool = toolMap.get(toolCall.name);

        if (tool === undefined) {
          // Unknown tool — tell the agent
          messages.push({
            role: "tool",
            content: JSON.stringify({
              error: `Unknown tool: ${toolCall.name}`,
            }),
            tool_call_id: toolCall.name,
          });
          continue;
        }

        // Check if this is the terminal extract_recipe tool
        if (toolCall.name === "extract_recipe") {
          return parseExtractRecipeOutput(toolCall.arguments);
        }

        // Execute the tool
        try {
          const result = await tool.execute(toolCall.arguments);
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: toolCall.name,
          });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown tool error";
          messages.push({
            role: "tool",
            content: JSON.stringify({
              error: `Tool execution failed: ${message}`,
            }),
            tool_call_id: toolCall.name,
          });
        }
      }
    } else if (aiResponse.response !== undefined && aiResponse.response !== null) {
      // The model returned a text response instead of a tool call.
      // Try to parse it as a recipe extract JSON.
      const parsed = tryParseResponseAsExtract(aiResponse.response);
      if (parsed !== null) {
        return parsed;
      }

      // If we can't parse it, add it to conversation and ask the model
      // to call extract_recipe.
      messages.push({
        role: "assistant",
        content: aiResponse.response,
      });
      messages.push({
        role: "user",
        content:
          "Please use the extract_recipe tool to submit the structured recipe data. Do not respond with text — use the tool.",
      });
    } else {
      // Empty response — the model didn't return anything useful
      return err({
        type: "ExtractionFailed" as const,
        reason: "AI model returned empty response",
      });
    }
  }

  // Max turns exceeded
  return err({
    type: "ExtractionFailed" as const,
    reason: `Agent exceeded maximum number of turns (${maxTurns})`,
  });
}

// ---------------------------------------------------------------------------
// Anthropic Claude agent path
// ---------------------------------------------------------------------------

async function runWithClaude(
  config: AgentConfig,
  input: AgentInput,
  visionModel: string,
  transcriptionModel: string,
  maxTurns: number,
  timeoutMs: number,
): Promise<Result<RecipeExtract, ImportError>> {
  const tools =
    config.tools ??
    createAllTools({
      deps: {
        fetchFn: config.fetchFn,
        aiRunFn: config.aiRunFn ?? (async () => ({})),
      },
      visionModel,
      transcriptionModel,
    });

  try {
    const result = await runClaudeAgent(
      {
        apiKey: config.anthropicApiKey ?? "",
        model: config.reasoningModel ?? DEFAULT_REASONING_MODEL,
        systemPrompt: EXTRACTION_AGENT_SYSTEM_PROMPT,
        tools,
        maxTurns,
        timeoutMs,
        fetchFn: config.fetchFn,
      },
      buildUserMessage(input),
    );

    if (result.finalToolCall !== null && result.finalToolCall.name === "extract_recipe") {
      return parseExtractRecipeOutput(result.finalToolCall.arguments);
    }

    // Try to parse text response as recipe
    if (result.textResponse !== null) {
      const parsed = tryParseResponseAsExtract(result.textResponse);
      if (parsed !== null) return parsed;
    }

    return err({
      type: "ExtractionFailed" as const,
      reason: `Agent completed in ${result.turns} turns without extracting a recipe`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return err({
      type: "ExtractionFailed" as const,
      reason: `Claude agent failed: ${message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Helper: try to parse a text response as a recipe extract
// ---------------------------------------------------------------------------

function tryParseResponseAsExtract(response: string): Result<RecipeExtract, ImportError> | null {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch === null) return null;

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    // Check if it looks like a recipe extract (has title and ingredients)
    if ("title" in obj && ("ingredients" in obj || "instructions" in obj)) {
      return parseExtractRecipeOutput(obj);
    }

    return null;
  } catch {
    return null;
  }
}
