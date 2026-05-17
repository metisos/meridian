/**
 * @meridian/agent — Gemini 3 reasoning agent using MongoDB MCP + Splunk MCP.
 */

export const AGENT_PACKAGE = "@meridian/agent" as const;

export { connectMongoMcp, type MongoMcpOptions, type MongoMcpHandle } from "./mcp/mongo.js";
export { connectSplunkMcp, type SplunkMcpOptions, type SplunkMcpHandle } from "./mcp/splunk.js";
export { GeminiClient, type GeminiClientOptions, type AskOptions, type AskResult } from "./client.js";
export {
  AgenticLoop,
  type AgenticLoopOptions,
  type RunOptions,
  type RunResult,
  type StepEvent,
} from "./agenticLoop.js";
export { buildCausalChain, type CausalChain, type CausalLink, type CausalArtifact } from "./causalChain.js";
export { computeBlastRadius, type BlastRadius } from "./blastRadius.js";
export { searchMemory, type MemoryHit } from "./memory.js";
export { investigate, type InvestigationInput, type InvestigationResult } from "./investigation.js";
