// ---------------------------------------------------------------------------
// AI Recipe Extraction Agent (SPEC SS7)
// ---------------------------------------------------------------------------
// An agent loop that uses Workers AI with tool calling to intelligently
// extract recipes from any input (URL, text, image).
// ---------------------------------------------------------------------------

import type { Result, RecipeExtract, ImportError } from "@dough/shared";
import { err } from "@dough/shared";
import type { AgentTool, FetchFn, AiRunFn } from "./tools.js";
import { createAllTools, parseExtractRecipeOutput } from "./tools.js";
import { EXTRACTION_AGENT_SYSTEM_PROMPT, buildUserMessage } from "./prompts.js";
import { runClaudeAgent, type AnthropicAgentConfig } from "./anthropic.js";
import { createLogger, truncate, type Logger } from "../logger.js";

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
  readonly maxTurns?: number; // default: 30
  /** Timeout in milliseconds for the entire agent run. */
  readonly timeoutMs?: number; // default: 600000 (10 min)
  /** Override the tools used by the agent (for testing). */
  readonly tools?: AgentTool[];
  /** Optional logger instance. Falls back to createLogger("ai-agent"). */
  readonly logger?: Logger;
  /** Custom fetch for the Anthropic SDK — used in tests to mock API calls. */
  readonly anthropicFetchFn?: AnthropicAgentConfig["fetchFn"];
}

/**
 * Input to the extraction agent.
 */
export interface AgentInput {
  readonly type: "url" | "text" | "image" | "video";
  readonly content: string;
  /** Only present for type: "video" — pre-processed transcript from audio. */
  readonly transcript?: string | null;
  /** Only present for type: "video" — on-screen text extracted from keyframes. */
  readonly frameTexts?: readonly string[];
  /** Only present for type: "video" — caption from the social media post. */
  readonly caption?: string | null;
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
  const agentLogger = config.logger ?? createLogger("ai-agent");
  const visionModel = config.visionModel ?? DEFAULT_VISION_MODEL;
  const transcriptionModel = config.transcriptionModel ?? DEFAULT_TRANSCRIPTION_MODEL;
  const maxTurns = config.maxTurns ?? 30;
  const timeoutMs = config.timeoutMs ?? 600000; // 10 minutes

  agentLogger.info("agent_started", {
    inputType: input.type,
    contentLength: input.content.length,
    maxTurns,
    timeoutMs,
    useClaude: config.anthropicApiKey !== undefined && config.anthropicApiKey.length > 0,
  });

  const agentStartTime = Date.now();

  // Prefer Anthropic Claude for reasoning (superior tool use)
  if (config.anthropicApiKey) {
    const result = await runWithClaude(
      config,
      input,
      visionModel,
      transcriptionModel,
      maxTurns,
      timeoutMs,
    );
    const totalDurationMs = Date.now() - agentStartTime;
    if (result.ok) {
      agentLogger.info("agent_completed", {
        inputType: input.type,
        title: result.value.title ?? null,
        ingredientGroupCount: result.value.ingredients.length,
        confidence: result.value.confidence?.overall ?? null,
        totalDurationMs,
      });
    } else {
      agentLogger.error("agent_failed", {
        inputType: input.type,
        errorType: result.error.type,
        reason: "reason" in result.error ? result.error.reason : null,
        totalDurationMs,
      });
    }
    return result;
  }

  // Fall back to Workers AI
  const reasoningModel = config.reasoningModel ?? DEFAULT_REASONING_MODEL;

  // Build tools
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

  if (!config.aiRunFn) {
    return err({
      type: "ExtractionFailed" as const,
      reason: "No AI provider configured. Set ANTHROPIC_API_KEY or enable Workers AI.",
    });
  }

  const aiRunFn = config.aiRunFn;

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
      agentLogger.error("agent_timeout", { turn, elapsedMs: Date.now() - startTime });
      return err({ type: "Timeout" as const });
    }

    // -----------------------------------------------------------------------
    // workersai_api_call_start
    // -----------------------------------------------------------------------
    agentLogger.info("workersai_api_call_start", {
      turn,
      model: reasoningModel,
      messageCount: messages.length,
      toolCount: toolDefinitions.length,
    });

    // Call the AI model
    let aiResponse: AiResponse;
    const aiCallStart = Date.now();
    try {
      const rawResponse = await aiRunFn(reasoningModel, {
        messages,
        tools: toolDefinitions,
        max_tokens: 4096,
      });

      aiResponse = rawResponse as AiResponse;
      const callDurationMs = Date.now() - aiCallStart;

      // workersai_api_call_complete
      agentLogger.info("workersai_api_call_complete", {
        turn,
        model: reasoningModel,
        hasToolCalls:
          aiResponse.tool_calls !== undefined &&
          aiResponse.tool_calls !== null &&
          aiResponse.tool_calls.length > 0,
        hasTextResponse: aiResponse.response !== undefined && aiResponse.response !== null,
        duration_ms: callDurationMs,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown AI model error";
      agentLogger.error("workersai_error", {
        turn,
        model: reasoningModel,
        error: message,
        duration_ms: Date.now() - aiCallStart,
      });
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
        // workersai_tool_call
        agentLogger.info("workersai_tool_call", {
          turn,
          toolName: toolCall.name,
          inputSummary: truncate(JSON.stringify(toolCall.arguments), 200),
        });

        const tool = toolMap.get(toolCall.name);

        if (tool === undefined) {
          // Unknown tool — tell the agent
          agentLogger.warn("workersai_tool_call", {
            turn,
            toolName: toolCall.name,
            error: "Unknown tool",
          });
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
          const totalDurationMs = Date.now() - startTime;
          const recipeTitle =
            typeof toolCall.arguments["title"] === "string" ? toolCall.arguments["title"] : null;

          // workersai_terminal_tool
          agentLogger.info("workersai_terminal_tool", {
            turn: turn + 1,
            toolName: "extract_recipe",
            recipeTitle,
            totalDurationMs,
          });

          const extractResult = parseExtractRecipeOutput(toolCall.arguments);
          if (extractResult.ok) {
            agentLogger.info("agent_completed", {
              inputType: input.type,
              title: extractResult.value.title ?? null,
              ingredientGroupCount: extractResult.value.ingredients.length,
              confidence: extractResult.value.confidence?.overall ?? null,
              turnsUsed: turn + 1,
              totalDurationMs,
            });
          }
          return extractResult;
        }

        // Execute the tool
        const toolStart = Date.now();
        try {
          const result = await tool.execute(toolCall.arguments);
          const toolDurationMs = Date.now() - toolStart;

          // workersai_tool_result
          agentLogger.info("workersai_tool_result", {
            turn,
            toolName: toolCall.name,
            resultSummary: truncate(result, 200),
            duration_ms: toolDurationMs,
          });
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: toolCall.name,
          });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown tool error";
          agentLogger.error("workersai_error", {
            turn,
            toolName: toolCall.name,
            error: message,
            duration_ms: Date.now() - toolStart,
            context: "tool_execution",
          });
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
      // workersai_text_response — model returned text instead of a tool call
      agentLogger.info("workersai_text_response", {
        turn,
        responseSummary: truncate(aiResponse.response, 200),
      });
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
      agentLogger.error("agent_empty_response", { turn });
      return err({
        type: "ExtractionFailed" as const,
        reason: "AI model returned empty response",
      });
    }
  }

  // Max turns exceeded
  agentLogger.error("agent_max_turns_exceeded", {
    maxTurns,
    totalDurationMs: Date.now() - startTime,
  });
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
        logger: config.logger,
        fetchFn: config.anthropicFetchFn,
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
