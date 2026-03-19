// ---------------------------------------------------------------------------
// Anthropic Claude adapter for the extraction agent
// ---------------------------------------------------------------------------
// Uses the official @anthropic-ai/sdk for the Messages API with native
// tool use. Claude handles recipe extraction via a multi-turn agent loop.
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import type { AgentTool } from "./tools.js";
import { createLogger, truncate, type Logger } from "../logger.js";

/** Default Claude model for agent reasoning (alias). */
export const CLAUDE_MODEL = "claude-sonnet-4-0";

/**
 * Configuration for the Anthropic-backed agent.
 */
export interface AnthropicAgentConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly systemPrompt: string;
  readonly tools: AgentTool[];
  readonly maxTurns?: number;
  readonly timeoutMs?: number;
  /** Optional logger instance. Falls back to createLogger("anthropic-agent"). */
  readonly logger?: Logger;
  /** Custom fetch for the Anthropic SDK — used in tests to mock API calls. */
  readonly fetchFn?: Anthropic["_options"]["fetch"];
}

/**
 * Run the agent loop using the Anthropic Messages API with native tool use.
 *
 * Uses the official SDK which provides typed requests/responses, automatic
 * retries on 429/5xx, and proper error classes.
 */
export async function runClaudeAgent(
  config: AnthropicAgentConfig,
  userMessage: string,
): Promise<{
  finalToolCall: { name: string; arguments: Record<string, unknown> } | null;
  textResponse: string | null;
  turns: number;
}> {
  const log = config.logger ?? createLogger("anthropic-agent");
  const model = config.model ?? CLAUDE_MODEL;
  const maxTurns = config.maxTurns ?? 30;
  const timeoutMs = config.timeoutMs ?? 300000; // 5 minutes

  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.fetchFn !== undefined ? { fetch: config.fetchFn } : {}),
  });

  // Build Anthropic tool definitions from our AgentTool interface
  const toolDefs: Anthropic.Tool[] = config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: tool.parameters.properties as Record<string, unknown>,
      required: tool.parameters.required as string[],
    },
  }));

  // Build tool lookup
  const toolMap = new Map<string, AgentTool>();
  for (const tool of config.tools) {
    toolMap.set(tool.name, tool);
  }

  // Initialize conversation
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  const startTime = Date.now();

  for (let turn = 0; turn < maxTurns; turn++) {
    if (Date.now() - startTime > timeoutMs) {
      log.error("claude_agent_timeout", { turn, elapsedMs: Date.now() - startTime });
      return { finalToolCall: null, textResponse: "Agent timed out", turns: turn };
    }

    // -----------------------------------------------------------------------
    // claude_api_call_start
    // -----------------------------------------------------------------------
    log.info("claude_api_call_start", {
      turn,
      model,
      messageCount: messages.length,
      toolCount: toolDefs.length,
    });

    // Call Anthropic Messages API via SDK (auto-retries 429/5xx)
    const apiCallStart = Date.now();
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: config.systemPrompt,
        tools: toolDefs,
        messages,
      });
    } catch (error: unknown) {
      const durationMs = Date.now() - apiCallStart;
      if (error instanceof Anthropic.APIError) {
        log.error("claude_error", {
          turn,
          status: error.status,
          body: truncate(error.message, 200),
          durationMs,
        });
        throw new Error(`Anthropic API error ${error.status}: ${error.message}`, { cause: error });
      }
      const msg = error instanceof Error ? error.message : "Unknown error";
      log.error("claude_error", { turn, error: msg, durationMs });
      throw error;
    }

    const apiCallDurationMs = Date.now() - apiCallStart;

    // -----------------------------------------------------------------------
    // claude_api_call_complete
    // -----------------------------------------------------------------------
    log.info("claude_api_call_complete", {
      turn,
      model,
      stop_reason: response.stop_reason,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      duration_ms: apiCallDurationMs,
    });

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    // Check if the response contains tool_use blocks — branch on actual
    // content rather than stop_reason, because a "max_tokens" response can
    // still include completed tool_use blocks that need tool_results.
    const hasToolUse = response.content.some((block) => block.type === "tool_use");
    if (hasToolUse) {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const toolInput = block.input as Record<string, unknown>;

        // -------------------------------------------------------------------
        // claude_tool_call — log every tool call from the model
        // -------------------------------------------------------------------
        log.info("claude_tool_call", {
          turn,
          toolName: block.name,
          inputSummary: truncate(JSON.stringify(toolInput), 200),
        });

        // Check for terminal tool
        if (block.name === "extract_recipe") {
          const recipeTitle =
            typeof toolInput["title"] === "string" ? (toolInput["title"] as string) : null;
          log.info("claude_terminal_tool", {
            turn: turn + 1,
            toolName: "extract_recipe",
            recipeTitle,
            totalDurationMs: Date.now() - startTime,
          });
          return {
            finalToolCall: { name: block.name, arguments: toolInput },
            textResponse: null,
            turns: turn + 1,
          };
        }

        const tool = toolMap.get(block.name);

        if (tool === undefined) {
          log.warn("claude_tool_call", {
            turn,
            toolName: block.name,
            error: "Unknown tool",
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
          });
          continue;
        }

        // Execute the tool
        const toolStart = Date.now();
        try {
          const result = await tool.execute(toolInput);
          const toolDurationMs = Date.now() - toolStart;

          log.info("claude_tool_result", {
            turn,
            toolName: block.name,
            resultSummary: truncate(result, 200),
            duration_ms: toolDurationMs,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          const toolDurationMs = Date.now() - toolStart;
          log.error("claude_error", {
            turn,
            toolName: block.name,
            error: msg,
            duration_ms: toolDurationMs,
            context: "tool_execution",
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Tool error: ${msg}` }),
          });
        }
      }

      // Add tool results as user message (Anthropic protocol)
      messages.push({ role: "user", content: toolResults });
    } else {
      // Model returned a text response (end_turn)
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      const text = textBlocks.map((b) => b.text).join("\n");

      // -------------------------------------------------------------------
      // claude_text_response — model returned text instead of tool call
      // -------------------------------------------------------------------
      log.info("claude_text_response", {
        turn: turn + 1,
        responseSummary: truncate(text, 200),
        totalDurationMs: Date.now() - startTime,
      });

      // Try to parse it as a recipe extract JSON before giving up.
      // If it can't be parsed, ask the model to call extract_recipe and
      // continue the loop — matching the Workers AI retry behaviour.
      const parsed = tryParseAsJson(text);
      if (parsed !== null) {
        return {
          finalToolCall: { name: "extract_recipe", arguments: parsed },
          textResponse: null,
          turns: turn + 1,
        };
      }

      // Ask the model to use the extract_recipe tool instead of text
      messages.push({
        role: "user",
        content:
          "Please use the extract_recipe tool to submit the structured recipe data. Do not respond with text — use the tool. If you were unable to extract a complete recipe, still call extract_recipe with whatever information you gathered and set overall_confidence to a low value.",
      });
    }
  }

  log.error("claude_agent_max_turns_exceeded", {
    maxTurns,
    totalDurationMs: Date.now() - startTime,
  });
  return { finalToolCall: null, textResponse: "Max turns exceeded", turns: maxTurns };
}

// ---------------------------------------------------------------------------
// Helper: try to parse a text response as a recipe JSON object
// ---------------------------------------------------------------------------

function tryParseAsJson(text: string): Record<string, unknown> | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch === null) return null;

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const obj = parsed as Record<string, unknown>;
    // Must look like a recipe (has title and ingredients or instructions)
    if ("title" in obj && ("ingredients" in obj || "instructions" in obj)) {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}
