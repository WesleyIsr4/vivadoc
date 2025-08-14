import { join } from 'path';
import { existsSync } from 'fs';
import { StackDetector } from '../detectors/stack-detector';
import { IndexManager } from '../indexing/index-manager';
import { HybridSearch } from '../search/hybrid-search';
import { LLMProviderFactory } from '../llm/provider-factory';
import { ResponseGenerator } from '../chat/response-generator';
import { ConfigManager } from '../config/config-manager';
import { VivadocError, ErrorCode } from '../utils/errors';
import type {
  VivadocConfig,
  ChatMessage,
  SearchQuery,
  SearchResult,
  IndexStats,
  LLMProvider,
  QueryIntent
} from '../types';

export interface AskOptions {
  intent?: QueryIntent;
  previousMessages?: ChatMessage[];
  streaming?: boolean;
}

export interface SearchOptions {
  limit?: number;
  filters?: any;
  rerank?: boolean;
}

export class Vivadoc {
  private config: VivadocConfig;
  private indexManager: IndexManager;
  private hybridSearch: HybridSearch;
  private llmProvider: LLMProvider | null = null;
  private responseGenerator: ResponseGenerator | null = null;
  private initialized = false;

  constructor(config: Partial<VivadocConfig>) {
    // Set defaults
    this.config = {
      name: 'Vivadoc Project',
      root: process.cwd(),
      stack: 'auto',
      llmProvider: 'auto',
      includePatterns: ['src/**/*', 'docs/**/*', 'README.md'],
      ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
      maxFileSize: 1024 * 1024, // 1MB
      chunkSize: 1000,
      chunkOverlap: 200,
      ...config
    };

    // Resolve root path
    this.config.root = resolve(this.config.root);
    
    // Initialize core components
    this.indexManager = new IndexManager(this.config.root);
    this.hybridSearch = new HybridSearch();
  }

  /**
   * Initialize the Vivadoc instance (detect stack, setup providers, etc.)
   */
  async init(): Promise<void> {
    try {
      // Auto-detect stack if needed
      if (this.config.stack === 'auto') {
        const detector = new StackDetector(this.config.root);
        const detectedStack = await detector.detectStack();
        this.config.stack = detectedStack;
      }

      // Initialize LLM provider
      if (this.config.llmProvider === 'auto') {
        this.llmProvider = await LLMProviderFactory.create({ type: 'auto' });
      } else {
        this.llmProvider = await LLMProviderFactory.create({ 
          type: this.config.llmProvider as any 
        });
      }

      if (!this.llmProvider) {
        throw VivadocError.llmNotConfigured(this.config.llmProvider);
      }

      // Save configuration
      const configManager = new ConfigManager(this.config.root);
      await configManager.saveConfig(this.config);

      this.initialized = true;
    } catch (error) {
      throw error instanceof VivadocError ? error : new VivadocError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to initialize Vivadoc: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Index the codebase
   */
  async index(): Promise<IndexStats> {
    this.ensureInitialized();

    try {
      const stats = await this.indexManager.indexProject(this.config);
      
      // Load search data
      const indexData = await this.indexManager.loadIndexData();
      await this.hybridSearch.loadData(indexData);

      return stats;
    } catch (error) {
      throw error instanceof VivadocError ? error : VivadocError.indexingFailed(
        this.config.root,
        error as Error
      );
    }
  }

  /**
   * Ask a question about the codebase
   */
  async ask(question: string, options: AskOptions = {}): Promise<ChatMessage> {
    this.ensureInitialized();
    this.ensureIndexed();
    this.ensureResponseGenerator();

    try {
      const response = await this.responseGenerator!.generateResponse(
        question,
        options.intent,
        options.previousMessages
      );

      return response;
    } catch (error) {
      throw error instanceof VivadocError ? error : new VivadocError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to generate response: ${(error as Error).message}`,
        { question, options },
        error as Error
      );
    }
  }

  /**
   * Ask with streaming response
   */
  async askStream(
    question: string, 
    onChunk: (chunk: string) => void,
    options: AskOptions = {}
  ): Promise<ChatMessage> {
    this.ensureInitialized();
    this.ensureIndexed();
    this.ensureResponseGenerator();

    try {
      const response = await this.responseGenerator!.generateStreamingResponse(
        question,
        options.intent,
        options.previousMessages,
        onChunk
      );

      return response;
    } catch (error) {
      throw error instanceof VivadocError ? error : new VivadocError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to generate streaming response: ${(error as Error).message}`,
        { question, options },
        error as Error
      );
    }
  }

  /**
   * Search the codebase
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    this.ensureInitialized();
    this.ensureIndexed();

    try {
      const searchQuery: SearchQuery = {
        text: query,
        type: 'explanation',
        filters: options.filters
      };

      const results = await this.hybridSearch.search(searchQuery, options.limit || 10);
      return results;
    } catch (error) {
      throw VivadocError.searchFailed(query, error as Error);
    }
  }

  /**
   * Get project statistics
   */
  async getStats(): Promise<{
    config: VivadocConfig;
    indexStats?: IndexStats;
    llmProvider?: string;
    isInitialized: boolean;
  }> {
    let indexStats: IndexStats | undefined;
    
    if (this.isIndexed()) {
      try {
        indexStats = await this.indexManager.getStats();
      } catch (error) {
        // Stats not available
      }
    }

    return {
      config: this.config,
      indexStats,
      llmProvider: this.llmProvider?.name,
      isInitialized: this.initialized
    };
  }

  /**
   * Check if the project is indexed
   */
  isIndexed(): boolean {
    const indexPath = join(this.config.root, '.vivadoc');
    return existsSync(indexPath);
  }

  /**
   * Get configuration
   */
  getConfig(): VivadocConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VivadocConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Private methods
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new VivadocError(
        ErrorCode.INVALID_CONFIG,
        'Vivadoc instance not initialized. Call init() first.'
      );
    }
  }

  private ensureIndexed(): void {
    if (!this.isIndexed()) {
      throw VivadocError.indexNotFound(this.config.root);
    }
  }

  private ensureResponseGenerator(): void {
    if (!this.responseGenerator) {
      if (!this.llmProvider) {
        throw VivadocError.llmNotConfigured();
      }

      this.responseGenerator = new ResponseGenerator(
        this.hybridSearch,
        this.llmProvider,
        {
          maxTokens: this.config.maxTokens || 2000,
          temperature: 0.1,
          requireCitations: true,
          noResponseThreshold: 0.3,
          language: 'pt'
        }
      );
    }
  }

  // Static factory methods
  static async create(config: Partial<VivadocConfig>): Promise<Vivadoc> {
    const vivadoc = new Vivadoc(config);
    await vivadoc.init();
    return vivadoc;
  }

  static async createFromProject(projectRoot: string): Promise<Vivadoc> {
    const configManager = new ConfigManager(projectRoot);
    
    let config: VivadocConfig;
    try {
      config = await configManager.loadConfig();
    } catch (error) {
      throw VivadocError.configNotFound(join(projectRoot, 'vivadoc.config.json'));
    }

    return Vivadoc.create(config);
  }
}

// Helper function
function resolve(path: string): string {
  return require('path').resolve(path);
}