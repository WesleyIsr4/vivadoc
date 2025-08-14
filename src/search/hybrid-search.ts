import { Chunk, SearchQuery, SearchResult, SearchFilters } from "../types";
import { CrossEncoderReranker } from "./cross-encoder-reranker";
import { EmbeddingCache } from "./embedding-cache";

export class HybridSearch {
  private chunks: Chunk[] = [];
  private bm25Index: Map<string, Map<string, number>> = new Map();
  private vectorIndex: Map<string, number[]> = new Map();
  private reranker: CrossEncoderReranker | null;
  private embeddingCache: EmbeddingCache | null;

  constructor(
    enableReranking: boolean = true,
    cacheDir?: string,
    maxCacheEntries: number = 10000
  ) {
    this.reranker = enableReranking ? new CrossEncoderReranker() : null;
    this.embeddingCache = cacheDir
      ? new EmbeddingCache(cacheDir, maxCacheEntries)
      : null;
  }

  addChunks(newChunks: Chunk[]): void {
    this.chunks.push(...newChunks);
  }

  async rebuildIndexes(
    progressCallback?: (status: string) => void
  ): Promise<void> {
    progressCallback?.("Construindo índice BM25...");
    await this.buildBM25Index();

    progressCallback?.("Construindo índice vetorial...");
    await this.buildVectorIndex();

    progressCallback?.("Índices construídos com sucesso!");
  }

  private async buildBM25Index(): Promise<void> {
    this.bm25Index.clear();

    const termFreq: Map<string, number> = new Map();
    const docFreq: Map<string, number> = new Map();

    let processedChunks = 0;
    for (const chunk of this.chunks) {
      const terms = this.tokenize(chunk.content);
      const docTerms = new Set<string>();

      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
        docTerms.add(term);
      }

      for (const term of docTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }

      if (++processedChunks % 100 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    processedChunks = 0;
    for (const chunk of this.chunks) {
      const terms = this.tokenize(chunk.content);
      const chunkIndex = new Map<string, number>();

      for (const term of terms) {
        const tf = terms.filter((t) => t === term).length;
        const df = docFreq.get(term) || 0;
        const idf = Math.log((this.chunks.length - df + 0.5) / (df + 0.5));
        const score = tf * idf;

        chunkIndex.set(term, score);
      }

      this.bm25Index.set(chunk.id, chunkIndex);

      if (++processedChunks % 50 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  private async buildVectorIndex(): Promise<void> {
    this.vectorIndex.clear();

    const docFreq = new Map<string, number>();

    for (const chunk of this.chunks) {
      const terms = this.tokenize(chunk.content);
      const uniqueTermsInDoc = new Set(terms);

      for (const term of uniqueTermsInDoc) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    let processedChunks = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const chunk of this.chunks) {
      let vector: number[] | null = null;

      if (this.embeddingCache) {
        vector = this.embeddingCache.get(chunk.content);
        if (vector) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
      }

      if (!vector) {
        const terms = this.tokenize(chunk.content);
        const termFreq: Map<string, number> = new Map();

        for (const term of terms) {
          termFreq.set(term, (termFreq.get(term) || 0) + 1);
        }

        vector = [];
        const uniqueTerms = Array.from(new Set(terms));

        for (const term of uniqueTerms) {
          const tf = termFreq.get(term) || 0;
          const df = docFreq.get(term) || 0;
          const idf = Math.log(this.chunks.length / (df + 1));
          vector.push(tf * idf);
        }

        if (this.embeddingCache) {
          this.embeddingCache.set(chunk.content, vector);
        }
      }

      this.vectorIndex.set(chunk.id, vector);

      if (++processedChunks % 50 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    if (this.embeddingCache && (cacheHits > 0 || cacheMisses > 0)) {
      const totalRequests = cacheHits + cacheMisses;
      const hitRate = ((cacheHits / totalRequests) * 100).toFixed(1);
      console.log(
        `Cache embeddings: ${cacheHits}/${totalRequests} hits (${hitRate}%)`
      );
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2)
      .filter((term) => !this.isStopWord(term));
  }

  private isStopWord(term: string): boolean {
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "this",
      "that",
      "these",
      "those",
    ]);
    return stopWords.has(term);
  }

  async search(query: SearchQuery, limit = 20): Promise<SearchResult[]> {
    const queryTerms = this.tokenize(query.text);

    const searchLimit = this.reranker ? Math.min(limit * 3, 100) : limit;

    const bm25Results = this.bm25Search(queryTerms, searchLimit);
    const vectorResults = this.vectorSearch(queryTerms, searchLimit);
    const mergedResults = this.mergeResults(
      bm25Results,
      vectorResults,
      searchLimit
    );
    const filteredResults = this.applyFilters(mergedResults, query.filters);

    let finalResults: SearchResult[];
    if (this.reranker && filteredResults.length > 0) {
      const rerankingResults = await this.reranker.rerank(
        query.text,
        filteredResults,
        limit
      );

      finalResults = rerankingResults.map((result) => ({
        chunk: result.chunk,
        score: result.combinedScore,
        relevance: result.combinedScore,
        citations: [
          {
            filePath: result.chunk.filePath,
            startLine: result.chunk.startLine,
            endLine: result.chunk.endLine,
            content: result.chunk.content.substring(0, 200) + "...",
          },
        ],
        rerankingScore: result.rerankScore,
        originalScore: result.originalScore,
      }));
    } else {
      finalResults = this.diversifyResults(filteredResults, queryTerms, limit);
    }

    return finalResults;
  }

  private bm25Search(queryTerms: string[], limit: number): SearchResult[] {
    const scores = new Map<string, number>();

    for (const chunk of this.chunks) {
      const chunkIndex = this.bm25Index.get(chunk.id);
      if (!chunkIndex) continue;

      let score = 0;
      for (const term of queryTerms) {
        score += chunkIndex.get(term) || 0;
      }

      if (score > 0) {
        scores.set(chunk.id, score);
      }
    }

    return Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([chunkId, score]) => {
        const chunk = this.chunks.find((c) => c.id === chunkId)!;
        return {
          chunk,
          score,
          relevance: score,
          citations: [
            {
              filePath: chunk.filePath,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              content: chunk.content.substring(0, 200) + "...",
            },
          ],
        };
      });
  }

  private vectorSearch(queryTerms: string[], limit: number): SearchResult[] {
    const queryVector = this.createQueryVector(queryTerms);
    const scores = new Map<string, number>();

    for (const chunk of this.chunks) {
      const chunkVector = this.vectorIndex.get(chunk.id);
      if (!chunkVector) continue;

      const similarity = this.cosineSimilarity(queryVector, chunkVector);
      if (similarity > 0.1) {
        scores.set(chunk.id, similarity);
      }
    }

    return Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([chunkId, score]) => {
        const chunk = this.chunks.find((c) => c.id === chunkId)!;
        return {
          chunk,
          score,
          relevance: score,
          citations: [
            {
              filePath: chunk.filePath,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              content: chunk.content.substring(0, 200) + "...",
            },
          ],
        };
      });
  }

  private createQueryVector(queryTerms: string[]): number[] {
    const termFreq: Map<string, number> = new Map();

    for (const term of queryTerms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    const uniqueTerms = Array.from(new Set(queryTerms));
    const vector: number[] = [];

    for (const term of uniqueTerms) {
      const tf = termFreq.get(term) || 0;
      const df = this.chunks.filter((c) =>
        this.tokenize(c.content).includes(term)
      ).length;
      const idf = Math.log(this.chunks.length / (df + 1));
      vector.push(tf * idf);
    }

    return vector;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0) return 0;

    const minLength = Math.min(vecA.length, vecB.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLength; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private mergeResults(
    bm25Results: SearchResult[],
    vectorResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    const allResults = new Map<string, SearchResult>();

    bm25Results.forEach((result, index) => {
      const rrfScore = 1 / (60 + index + 1);
      allResults.set(result.chunk.id, {
        ...result,
        score: (allResults.get(result.chunk.id)?.score || 0) + rrfScore,
      });
    });

    vectorResults.forEach((result, index) => {
      const rrfScore = 1 / (60 + index + 1);
      allResults.set(result.chunk.id, {
        ...result,
        score: (allResults.get(result.chunk.id)?.score || 0) + rrfScore,
      });
    });

    return Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private applyFilters(
    results: SearchResult[],
    filters?: SearchFilters
  ): SearchResult[] {
    if (!filters) return results;

    return results.filter((result) => {
      if (
        filters.filePath &&
        !result.chunk.filePath.includes(filters.filePath)
      ) {
        return false;
      }

      if (filters.language && result.chunk.language !== filters.language) {
        return false;
      }

      if (filters.type && !filters.type.includes(result.chunk.metadata.type)) {
        return false;
      }

      if (
        filters.tags &&
        !filters.tags.some((tag) => result.chunk.metadata.tags.includes(tag))
      ) {
        return false;
      }

      return true;
    });
  }

  private diversifyResults(
    results: SearchResult[],
    _queryTerms: string[],
    limit: number
  ): SearchResult[] {
    if (results.length <= limit) return results;

    const diversified: SearchResult[] = [];
    const remaining = [...results];

    if (remaining.length > 0) {
      diversified.push(remaining.shift()!);
    }

    while (diversified.length < limit && remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = -1;

      for (let i = 0; i < remaining.length; i++) {
        const relevance = remaining[i].relevance;
        const redundancy = this.calculateRedundancy(
          remaining[i].chunk,
          diversified
        );
        const mmrScore = 0.7 * relevance - 0.3 * redundancy;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      diversified.push(remaining.splice(bestIndex, 1)[0]);
    }

    return diversified;
  }

  private calculateRedundancy(chunk: Chunk, selected: SearchResult[]): number {
    if (selected.length === 0) return 0;

    let totalSimilarity = 0;
    for (const selectedChunk of selected) {
      const similarity = this.cosineSimilarity(
        this.vectorIndex.get(chunk.id) || [],
        this.vectorIndex.get(selectedChunk.chunk.id) || []
      );
      totalSimilarity += similarity;
    }

    return totalSimilarity / selected.length;
  }

  getStats() {
    return {
      totalChunks: this.chunks.length,
      totalTerms: this.bm25Index.size,
      languages: this.chunks.reduce((acc, chunk) => {
        acc[chunk.language] = (acc[chunk.language] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  exportData() {
    return {
      chunks: this.chunks,
      stats: this.getStats(),
    };
  }

  async loadData(data: { chunks: Chunk[] }) {
    this.chunks = data.chunks || [];
    if (this.chunks.length > 0) {
      await this.rebuildIndexes();
    }
  }
}
