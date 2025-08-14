import { Chunk, SearchResult } from "../types";

export interface RerankingResult {
  chunk: Chunk;
  originalScore: number;
  rerankScore: number;
  combinedScore: number;
}

export class CrossEncoderReranker {
  private readonly weights = {
    original: 0.3,
    rerank: 0.7,
  };

  constructor(
    private originalWeight: number = 0.3,
    private rerankWeight: number = 0.7
  ) {
    const totalWeight = originalWeight + rerankWeight;
    this.weights.original = originalWeight / totalWeight;
    this.weights.rerank = rerankWeight / totalWeight;
  }

  async rerank(
    query: string,
    results: SearchResult[],
    topK: number = 20
  ): Promise<RerankingResult[]> {
    if (results.length === 0) {
      return [];
    }

    const rerankingResults: RerankingResult[] = await Promise.all(
      results.map(async (result) => {
        const rerankScore = await this.calculateCrossEncoderScore(
          query,
          result.chunk
        );

        const combinedScore =
          this.weights.original * result.score +
          this.weights.rerank * rerankScore;

        return {
          chunk: result.chunk,
          originalScore: result.score,
          rerankScore,
          combinedScore,
        };
      })
    );

    return rerankingResults
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);
  }

  private async calculateCrossEncoderScore(
    query: string,
    chunk: Chunk
  ): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 1));

    const queryLower = query.toLowerCase();
    const contentLower = chunk.content.toLowerCase();
    const pathLower = chunk.filePath.toLowerCase();

    let score = 0.0;

    const queryTerms = queryLower
      .split(/\s+/)
      .filter((term) => term.length > 2);
    const exactMatches = queryTerms.filter((term) =>
      contentLower.includes(term)
    ).length;
    score += (exactMatches / queryTerms.length) * 0.4;

    score += this.calculateSemanticSimilarity(queryLower, contentLower) * 0.3;

    score += this.calculateContextualRelevance(queryLower, chunk) * 0.2;

    score += this.calculateContentQuality(chunk) * 0.1;

    if (queryTerms.some((term) => pathLower.includes(term))) {
      score += 0.1;
    }

    if (this.isDocumentationFile(chunk.filePath)) {
      score += 0.05;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  private calculateSemanticSimilarity(query: string, content: string): number {
    const queryWords = new Set(query.split(/\s+/));
    const contentWords = new Set(content.split(/\s+/));

    const programmingTerms = new Map([
      ["function", ["método", "func", "def", "procedure"]],
      ["class", ["classe", "tipo", "interface", "struct"]],
      ["component", ["componente", "widget", "element"]],
      ["error", ["erro", "exception", "bug", "falha"]],
      ["test", ["teste", "spec", "unit", "integration"]],
      ["api", ["endpoint", "route", "service", "interface"]],
      ["config", ["configuração", "settings", "options"]],
      ["data", ["dados", "info", "information", "content"]],
    ]);

    let semanticScore = 0;
    let totalTerms = 0;

    for (const queryWord of queryWords) {
      totalTerms++;

      if (contentWords.has(queryWord)) {
        semanticScore += 1.0;
        continue;
      }

      const relatedTerms = programmingTerms.get(queryWord) || [];
      const hasRelated = relatedTerms.some((term) => contentWords.has(term));
      if (hasRelated) {
        semanticScore += 0.7;
        continue;
      }

      const hasPartial = Array.from(contentWords).some(
        (word) => word.includes(queryWord) || queryWord.includes(word)
      );
      if (hasPartial) {
        semanticScore += 0.3;
      }
    }

    return totalTerms > 0 ? semanticScore / totalTerms : 0;
  }

  private calculateContextualRelevance(query: string, chunk: Chunk): number {
    let relevance = 0;

    const queryAnalysis = this.analyzeQueryType(query);

    switch (queryAnalysis.type) {
      case "function":
        if (this.isFunctionDefinition(chunk.content)) relevance += 0.8;
        if (this.isFunctionUsage(chunk.content)) relevance += 0.6;
        break;

      case "class":
        if (this.isClassDefinition(chunk.content)) relevance += 0.8;
        if (this.isClassUsage(chunk.content)) relevance += 0.5;
        break;

      case "error":
        if (this.isErrorHandling(chunk.content)) relevance += 0.7;
        if (this.isErrorDefinition(chunk.content)) relevance += 0.9;
        break;

      case "test":
        if (this.isTestFile(chunk.filePath)) relevance += 0.8;
        if (this.isTestCode(chunk.content)) relevance += 0.6;
        break;

      case "documentation":
        if (this.isDocumentationFile(chunk.filePath)) relevance += 0.9;
        if (this.isComment(chunk.content)) relevance += 0.7;
        break;
    }

    if (chunk.startLine <= 10) {
      relevance += 0.1;
    }

    return Math.min(1.0, relevance);
  }

  private analyzeQueryType(query: string): {
    type: string;
    confidence: number;
  } {
    const queryLower = query.toLowerCase();

    const patterns = {
      function: /\b(function|método|func|procedure|procedimento)\b/,
      class: /\b(class|classe|tipo|interface)\b/,
      error: /\b(error|erro|exception|bug|falha)\b/,
      test: /\b(test|teste|spec|unit|integration)\b/,
      documentation: /\b(doc|documentation|documentação|readme|guide)\b/,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(queryLower)) {
        return { type, confidence: 0.8 };
      }
    }

    return { type: "general", confidence: 0.5 };
  }

  private isFunctionDefinition(content: string): boolean {
    const patterns = [
      /\bfunction\s+\w+\s*\(/,
      /\bdef\s+\w+\s*\(/,
      /\w+\s*=\s*\([^)]*\)\s*=>/,
      /\bmethod\s+\w+/,
      /\bfunc\s+\w+/,
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  private isFunctionUsage(content: string): boolean {
    return /\w+\s*\([^)]*\)/.test(content);
  }

  private isClassDefinition(content: string): boolean {
    const patterns = [
      /\bclass\s+\w+/,
      /\binterface\s+\w+/,
      /\btype\s+\w+\s*=/,
      /\bstruct\s+\w+/,
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  private isClassUsage(content: string): boolean {
    return /\bnew\s+\w+\s*\(/.test(content);
  }

  private isErrorHandling(content: string): boolean {
    const patterns = [
      /\btry\s*{/,
      /\bcatch\s*\(/,
      /\bfinally\s*{/,
      /\bthrow\s+/,
      /\braise\s+/,
      /\.catch\(/,
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  private isErrorDefinition(content: string): boolean {
    const patterns = [
      /\bclass\s+\w*Error/,
      /\bclass\s+\w*Exception/,
      /extends\s+Error/,
      /Error\s*\(/,
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\btest\b/,
      /\bspec\b/,
      /\.test\./,
      /\.spec\./,
      /__tests__/,
      /\/tests?\//,
    ];

    return testPatterns.some((pattern) => pattern.test(filePath.toLowerCase()));
  }

  private isTestCode(content: string): boolean {
    const patterns = [
      /\bdescribe\s*\(/,
      /\bit\s*\(/,
      /\btest\s*\(/,
      /\bexpect\s*\(/,
      /\bassert\./,
      /\@Test/,
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  private isDocumentationFile(filePath: string): boolean {
    const docPatterns = [
      /\.md$/,
      /\.mdx$/,
      /readme/i,
      /changelog/i,
      /contributing/i,
      /license/i,
      /\/docs?\//,
    ];

    return docPatterns.some((pattern) => pattern.test(filePath));
  }

  private isComment(content: string): boolean {
    const commentLines = content
      .split("\n")
      .filter(
        (line) =>
          line.trim().startsWith("//") ||
          line.trim().startsWith("*") ||
          line.trim().startsWith("#")
      ).length;

    const totalLines = content.split("\n").length;
    return commentLines / totalLines > 0.3;
  }

  private calculateContentQuality(chunk: Chunk): number {
    let quality = 0.5;

    const content = chunk.content;
    const lines = content.split("\n");

    if (this.isDocumentationFile(chunk.filePath)) {
      quality += 0.3;
    }

    const commentRatio =
      lines.filter(
        (line) =>
          line.trim().startsWith("//") ||
          line.trim().startsWith("*") ||
          line.trim().startsWith("#")
      ).length / lines.length;

    quality += commentRatio * 0.2;

    if (lines.length < 5) {
      quality -= 0.2;
    } else if (lines.length > 100) {
      quality -= 0.1;
    }

    if (this.isFunctionDefinition(content) || this.isClassDefinition(content)) {
      quality += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, quality));
  }

  getStats(results: RerankingResult[]): {
    totalResults: number;
    averageOriginalScore: number;
    averageRerankScore: number;
    averageCombinedScore: number;
    improvementRatio: number;
  } {
    if (results.length === 0) {
      return {
        totalResults: 0,
        averageOriginalScore: 0,
        averageRerankScore: 0,
        averageCombinedScore: 0,
        improvementRatio: 0,
      };
    }

    const avgOriginal =
      results.reduce((sum, r) => sum + r.originalScore, 0) / results.length;
    const avgRerank =
      results.reduce((sum, r) => sum + r.rerankScore, 0) / results.length;
    const avgCombined =
      results.reduce((sum, r) => sum + r.combinedScore, 0) / results.length;

    return {
      totalResults: results.length,
      averageOriginalScore: avgOriginal,
      averageRerankScore: avgRerank,
      averageCombinedScore: avgCombined,
      improvementRatio: avgCombined / avgOriginal,
    };
  }
}
