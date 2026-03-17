// ---------------------------------------------------------------------------
// AI module barrel export
// ---------------------------------------------------------------------------

export {
  runExtractionAgent,
  DEFAULT_REASONING_MODEL,
  DEFAULT_VISION_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
} from "./agent.js";

export type { AgentConfig, AgentInput } from "./agent.js";

export type { AgentTool, FetchFn, AiRunFn, ToolDeps } from "./tools.js";

export {
  createAllTools,
  createFetchUrlTool,
  createExtractSchemaOrgTool,
  createExtractVisibleTextTool,
  createFindLinksTool,
  createAnalyzeImageTool,
  createTranscribeAudioTool,
  createGetYoutubeInfoTool,
  createGetSocialPostTool,
  createExtractRecipeTool,
  parseExtractRecipeOutput,
  extractLinks,
} from "./tools.js";

export {
  extractSchemaOrgRecipe,
  extractVisibleText,
  schemaOrgToExtract,
  isSchemaOrgComplete,
  parseDuration,
} from "./schema-org.js";

export type { SchemaOrgRecipe } from "./schema-org.js";

export { EXTRACTION_AGENT_SYSTEM_PROMPT, buildUserMessage } from "./prompts.js";

export { runClaudeAgent, CLAUDE_MODEL } from "./anthropic.js";
export type { AnthropicAgentConfig } from "./anthropic.js";
