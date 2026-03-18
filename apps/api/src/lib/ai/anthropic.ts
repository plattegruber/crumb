// ---------------------------------------------------------------------------
// Anthropic Claude adapter for the extraction agent
// ---------------------------------------------------------------------------
// Translates between our agent's tool-calling protocol and the Anthropic
// Messages API. Uses Claude Sonnet 4 for superior agentic reasoning.
// ---------------------------------------------------------------------------

import type { AgentTool } from "./tools.js";
import { createLogger, truncate } from "../logger.js";

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
  const claudeLogger = createLogger("anthropic-agent");
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
      claudeLogger.error("claude_agent_timeout", { turn, elapsedMs: Date.now() - startTime });
      return { finalToolCall: null, textResponse: "Agent timed out", turns: turn };
    }

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

    if (!response.ok) {
      const errorText = await response.text();
      claudeLogger.error("anthropic_api_error", {
        turn,
        status: response.status,
        error: truncate(errorText, 200),
        durationMs: Date.now() - apiCallStart,
      });
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    claudeLogger.debug("anthropic_api_call", {
      turn,
      model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      stopReason: data.stop_reason,
      durationMs: Date.now() - apiCallStart,
    });

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: data.content });

    // Check if the model wants to use tools
    if (data.stop_reason === "tool_use") {
      const toolResults: AnthropicContentBlock[] = [];

      for (const block of data.content) {
        if (block.type !== "tool_use") continue;

        const tool = toolMap.get(block.name);

        // Check for terminal tool
        if (block.name === "extract_recipe") {
          claudeLogger.info("claude_extract_recipe_called", {
            turn: turn + 1,
            totalDurationMs: Date.now() - startTime,
          });
          return {
            finalToolCall: { name: block.name, arguments: block.input },
            textResponse: null,
            turns: turn + 1,
          };
        }

        if (tool === undefined) {
          claudeLogger.warn("claude_unknown_tool", { turn, toolName: block.name });
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
          claudeLogger.debug("claude_tool_executed", {
            turn,
            toolName: block.name,
            inputSummary: truncate(JSON.stringify(block.input), 200),
            outputSummary: truncate(result, 200),
            durationMs: Date.now() - toolStart,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          claudeLogger.error("claude_tool_error", {
            turn,
            toolName: block.name,
            error: msg,
            durationMs: Date.now() - toolStart,
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
      claudeLogger.info("claude_agent_text_response", {
        turn: turn + 1,
        responseSummary: truncate(text, 200),
        totalDurationMs: Date.now() - startTime,
      });
      return { finalToolCall: null, textResponse: text, turns: turn + 1 };
    }
  }

  claudeLogger.error("claude_agent_max_turns_exceeded", {
    maxTurns,
    totalDurationMs: Date.now() - startTime,
  });
  return { finalToolCall: null, textResponse: "Max turns exceeded", turns: maxTurns };
}
