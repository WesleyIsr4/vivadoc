// Main Vivadoc exports for programmatic usage
export { Vivadoc } from './core/vivadoc';
export { HybridSearch } from './search/hybrid-search';
export { LLMProviderFactory } from './llm/provider-factory';
export { StackDetector } from './detectors/stack-detector';
export { IndexManager } from './indexing/index-manager';
export { ResponseGenerator } from './chat/response-generator';
export { ChatSessionManager as SessionManager } from './chat/session-manager';

// LLM Providers
export { OpenAIProvider } from './llm/openai-provider';
export { OllamaProvider } from './llm/ollama-provider';
export { MockLLMProvider } from './llm/mock-provider';

// Types
export type {
  VivadocConfig,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  LLMResponse,
  Citation,
  SearchQuery,
  SearchResult,
  CodeChunk,
  ChunkMetadata,
  QueryIntent,
  ProjectStack,
  IndexStats
} from './types';

// Error classes
export { VivadocError, ErrorCode } from './utils/errors';

// Version
export const version = require('../package.json').version;