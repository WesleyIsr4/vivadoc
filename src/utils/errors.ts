export enum ErrorCode {
  // Configuration errors
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  INVALID_CONFIG = 'INVALID_CONFIG',
  
  // Index errors  
  INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',
  INDEXING_FAILED = 'INDEXING_FAILED',
  
  // LLM errors
  LLM_NOT_CONFIGURED = 'LLM_NOT_CONFIGURED',
  LLM_REQUEST_FAILED = 'LLM_REQUEST_FAILED',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  LLM_QUOTA_EXCEEDED = 'LLM_QUOTA_EXCEEDED',
  
  // Search errors
  SEARCH_FAILED = 'SEARCH_FAILED',
  INVALID_QUERY = 'INVALID_QUERY',
  
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DISK_FULL = 'DISK_FULL',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED'
}

export class VivadocError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode, 
    message: string, 
    details?: any,
    cause?: Error
  ) {
    super(message);
    this.name = 'VivadocError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    
    if (cause) {
      this.stack = cause.stack;
    }
  }

  static configNotFound(path: string): VivadocError {
    return new VivadocError(
      ErrorCode.CONFIG_NOT_FOUND,
      `Configuration file not found: ${path}. Run 'vivadoc init' first.`,
      { path }
    );
  }

  static indexNotFound(root: string): VivadocError {
    return new VivadocError(
      ErrorCode.INDEX_NOT_FOUND,
      `No index found for project at ${root}. Run 'vivadoc index' first.`,
      { root }
    );
  }

  static llmNotConfigured(provider?: string): VivadocError {
    const message = provider 
      ? `LLM provider '${provider}' is not properly configured`
      : 'No LLM provider is configured. Please set up OpenAI, Ollama, or another provider.';
      
    return new VivadocError(
      ErrorCode.LLM_NOT_CONFIGURED,
      message,
      { provider }
    );
  }

  static llmRequestFailed(error: Error, provider: string): VivadocError {
    return new VivadocError(
      ErrorCode.LLM_REQUEST_FAILED,
      `LLM request failed: ${error.message}`,
      { provider, originalError: error.message },
      error
    );
  }

  static searchFailed(query: string, error: Error): VivadocError {
    return new VivadocError(
      ErrorCode.SEARCH_FAILED,
      `Search failed for query: ${query}`,
      { query, originalError: error.message },
      error
    );
  }

  static indexingFailed(path: string, error: Error): VivadocError {
    return new VivadocError(
      ErrorCode.INDEXING_FAILED,
      `Failed to index path: ${path}`,
      { path, originalError: error.message },
      error
    );
  }

  static timeout(operation: string, timeoutMs: number): VivadocError {
    return new VivadocError(
      ErrorCode.TIMEOUT,
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { operation, timeoutMs }
    );
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
}