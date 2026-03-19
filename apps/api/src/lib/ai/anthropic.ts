// ---------------------------------------------------------------------------
// Anthropic Claude adapter for the extraction agent
// ---------------------------------------------------------------------------
// Translates between our agent's tool-calling protocol and the Anthropic
// Messages API. Uses Claude Sonnet 4 for superior agentic reasoning.
// ---------------------------------------------------------------------------

import type { AgentTool } from "./tools.js";
import { createLogger, truncate, type Logger } from "../logger.js";

/** Default Claude model for agent reasoning. */
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

/**
 * Anthropic Messages API types (minimal subset we need).
 */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { input_tokens: number; output_tokens: number };
}

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
  readonly fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Optional logger instance. Falls back to createLogger("anthropic-agent"). */
  readonly logger?: Logger;
}

/**
 * Run the agent loop using the Anthropic Messages API with native tool use.
 *
 * This is a direct implementation rather than going through the AiRunFn
 * abstraction, because Claude's tool use protocol is richer (tool_use_id,
 * multi-turn tool results, vision via content blocks).
 */
export async function runClaudeAgent(
  config: AnthropicAgentConfig,
  userMessage: string | AnthropicContentBlock[],
): Promise<{
  finalToolCall: { name: string; arguments: Record<string, unknown> } | null;
  textResponse: string | null;
  turns: number;
}> {
  const log = config.logger ?? createLogger("anthropic-agent");
  const model = config.model ?? CLAUDE_MODEL;
  const maxTurns = config.maxTurns ?? 30;
  const timeoutMs = config.timeoutMs ?? 300000; // 5 minutes
  const fetchFn = config.fetchFn ?? globalThis.fetch;

  // Build Anthropic tool definitions
  const toolDefs: AnthropicToolDef[] = config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: tool.parameters.properties,
      required: tool.parameters.required ?? [],
    },
  }));

  // Build tool lookup
  const toolMap = new Map<string, AgentTool>();
  for (const tool of config.tools) {
    toolMap.set(tool.name, tool);
  }

  // Initialize conversation
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: typeof userMessage === "string" ? userMessage : userMessage,
    },
  ];

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

    // Call Anthropic Messages API
    const apiCallStart = Date.now();
    const response = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: config.systemPrompt,
        tools: toolDefs,
        messages,
      }),
    });

    // -----------------------------------------------------------------------
    // claude_error — API error with status code and body
    // -----------------------------------------------------------------------
    if (!response.ok) {
      const errorText = await response.text();
      const durationMs = Date.now() - apiCallStart;
      log.error("claude_error", {
        turn,
        status: response.status,
        body: truncate(errorText, 200),
        durationMs,
      });
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const apiCallDurationMs = Date.now() - apiCallStart;

    // -----------------------------------------------------------------------
    // claude_api_call_complete
    // -----------------------------------------------------------------------
    log.info("claude_api_call_complete", {
      turn,
      model,
      stop_reason: data.stop_reason,
      input_tokens: data.usage.input_tokens,
      output_tokens: data.usage.output_tokens,
      duration_ms: apiCallDurationMs,
    });

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: data.content });

    // Check if the model wants to use tools
    if (data.stop_reason === "tool_use") {
      const toolResults: AnthropicContentBlock[] = [];

      for (const block of data.content) {
        if (block.type !== "tool_use") continue;

        // -------------------------------------------------------------------
        // claude_tool_call — log every tool call from the model
        // -------------------------------------------------------------------
        log.info("claude_tool_call", {
          turn,
          toolName: block.name,
          inputSummary: truncate(JSON.stringify(block.input), 200),
        });

        const tool = toolMap.get(block.name);

        // Check for terminal tool
        if (block.name === "extract_recipe") {
          // -----------------------------------------------------------------
          // claude_terminal_tool — log recipe title when extract_recipe called
          // -----------------------------------------------------------------
          const recipeTitle =
            typeof block.input["title"] === "string" ? block.input["title"] : null;
          log.info("claude_terminal_tool", {
            turn: turn + 1,
            toolName: "extract_recipe",
            recipeTitle,
            totalDurationMs: Date.now() - startTime,
          });
          return {
            finalToolCall: { name: block.name, arguments: block.input },
            textResponse: null,
            turns: turn + 1,
          };
        }

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
          const result = await tool.execute(block.input);
          const toolDurationMs = Date.now() - toolStart;

          // -----------------------------------------------------------------
          // claude_tool_result — log tool execution result
          // -----------------------------------------------------------------
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
      const textBlocks = data.content.filter(
        (b): b is { type: "text"; text: string } => b.type === "text",
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
        content: [
          {
            type: "text" as const,
            text: "Please use the extract_recipe tool to submit the structured recipe data. Do not respond with text — use the tool. If you were unable to extract a complete recipe, still call extract_recipe with whatever information you gathered and set overall_confidence to a low value.",
          },
        ],
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
