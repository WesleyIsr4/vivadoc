export interface ProjectConfig {
  name: string;
  root: string;
  stack: ProjectStack;
  ignorePatterns: string[];
  includePatterns: string[];
  maxFileSize: number;
  chunkSize: number;
  chunkOverlap: number;
}

// Main configuration interface for Vivadoc
export interface VivadocConfig {
  name?: string;
  root: string;
  stack?: ProjectStack | 'auto';
  llmProvider?: 'auto' | 'openai' | 'ollama' | 'mock';
  includePatterns?: string[];
  ignorePatterns?: string[];
  maxFileSize?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  maxTokens?: number;
  temperature?: number;
}

export type ProjectStack =
  | "nextjs"
  | "react"
  | "vue"
  | "svelte"
  | "angular"
  | "typescript"
  | "node"
  | "unknown";

// Alias for backward compatibility
export interface CodeChunk extends Chunk {}

export interface Chunk {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  metadata: ChunkMetadata;
  hash: string;
  embedding?: number[];
}

export interface ChunkMetadata {
  type:
    | "file"
    | "function"
    | "component"
    | "hook"
    | "service"
    | "route"
    | "test"
    | "interface"
    | "type"
    | "enum"
    | "class"
    | "namespace";
  exports?: string[];
  imports?: string[];
  props?: string[];
  types?: TypeScriptTypeInfo[];
  generics?: string[];
  tags: string[];
  visibility: "public" | "private" | "internal" | "protected" | "readonly";
  complexity?: number;
  isAsync?: boolean;
  returnType?: string;
  parameters?: ParameterInfo[];
}

export interface SearchQuery {
  text: string;
  type: "symbol" | "file" | "explanation" | "howto" | "route" | "error" | "test";
  filters?: SearchFilters;
}

export interface SearchFilters {
  filePath?: string;
  language?: string;
  type?: string[];
  tags?: string[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  relevance: number;
  citations: Citation[];
  rerankingScore?: number;
  originalScore?: number;
}

export interface Citation {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  processingTime: number;
  suggestions?: string[];
}

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  totalLines: number;
  languages: Record<string, number>;
  types: Record<string, number>;
  lastIndexed: Date;
  indexSize: number;
}

// Chat e LLM Types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  citations?: Citation[];
  metadata?: {
    processingTime?: number;
    tokensUsed?: number;
    confidence?: number;
  };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  context?: {
    recentFiles?: string[];
    activeProject?: string;
  };
}

export interface LLMProvider {
  name: string;
  generate(prompt: string, context?: string[]): Promise<LLMResponse>;
  generateStream?(prompt: string, context?: string[]): Promise<AsyncGenerator<string>>;
  getTokenCount?(text: string): number;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
  processingTime: number;
  confidence?: number;
  citations: Citation[];
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  context?: {
    includeRecent?: boolean;
    maxResults?: number;
    filters?: SearchFilters;
  };
}

export interface ChatResponse {
  message: ChatMessage;
  sessionId: string;
  suggestions?: string[];
  relatedChunks?: SearchResult[];
}

export interface QueryIntent {
  type: "symbol" | "file" | "explanation" | "howto" | "route" | "error" | "test";
  confidence: number;
  entities: string[];
  keywords: string[];
}

export interface ResponseConfig {
  maxTokens: number;
  temperature: number;
  requireCitations: boolean;
  noResponseThreshold: number;
  language: "pt" | "en";
}

export interface TypeScriptTypeInfo {
  name: string;
  kind: "interface" | "type" | "enum" | "class" | "generic";
  properties?: PropertyInfo[];
  extends?: string[];
  implements?: string[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  optional?: boolean;
  readonly?: boolean;
  visibility?: "public" | "private" | "protected";
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional?: boolean;
  defaultValue?: string;
}
