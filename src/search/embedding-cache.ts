import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

export interface CacheEntry {
  embedding: number[];
  hash: string;
  timestamp: number;
  access_count: number;
  last_access: number;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  cacheSize: number;
  oldestEntry: number;
  newestEntry: number;
}

export class EmbeddingCache {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheFilePath: string;
  private maxEntries: number;
  private maxAge: number;
  private hits: number = 0;
  private misses: number = 0;
  private isDirty: boolean = false;

  constructor(
    cacheDir: string,
    maxEntries: number = 10000,
    maxAge: number = 7 * 24 * 60 * 60 * 1000
  ) {
    this.maxEntries = maxEntries;
    this.maxAge = maxAge;
    this.cacheFilePath = join(cacheDir, "embeddings.cache.json");

    mkdirSync(cacheDir, { recursive: true });

    this.loadCache();
    this.scheduleCleanup();
  }

  get(content: string): number[] | null {
    const key = this.generateKey(content);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.isDirty = true;
      this.misses++;
      return null;
    }

    entry.access_count++;
    entry.last_access = Date.now();
    this.hits++;
    this.isDirty = true;

    return entry.embedding;
  }

  set(content: string, embedding: number[]): void {
    const key = this.generateKey(content);
    const now = Date.now();

    const entry: CacheEntry = {
      embedding: embedding,
      hash: key,
      timestamp: now,
      access_count: 1,
      last_access: now,
    };

    this.cache.set(key, entry);
    this.isDirty = true;

    if (this.cache.size > this.maxEntries) {
      this.evictLeastRecentlyUsed();
    }
  }

  has(content: string): boolean {
    const key = this.generateKey(content);
    const entry = this.cache.get(key);

    if (!entry || this.isExpired(entry)) {
      return false;
    }

    return true;
  }

  delete(content: string): boolean {
    const key = this.generateKey(content);
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.isDirty = true;
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.isDirty = true;
    this.persistCache();
  }

  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const hitRate =
      this.hits + this.misses > 0
        ? (this.hits / (this.hits + this.misses)) * 100
        : 0;

    return {
      totalEntries: this.cache.size,
      hitRate: hitRate,
      cacheSize: this.calculateCacheSize(),
      oldestEntry:
        entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : 0,
      newestEntry:
        entries.length > 0 ? Math.max(...entries.map((e) => e.timestamp)) : 0,
    };
  }

  async persistCache(): Promise<void> {
    if (!this.isDirty) return;

    try {
      const data = {
        cache: Array.from(this.cache.entries()),
        stats: { hits: this.hits, misses: this.misses },
        timestamp: Date.now(),
      };

      writeFileSync(this.cacheFilePath, JSON.stringify(data, null, 2));
      this.isDirty = false;
    } catch (error) {
      console.warn("Erro ao persistir cache de embeddings:", error);
    }
  }

  private loadCache(): void {
    try {
      if (!existsSync(this.cacheFilePath)) {
        return;
      }

      const data = JSON.parse(readFileSync(this.cacheFilePath, "utf-8"));

      if (data.cache && Array.isArray(data.cache)) {
        this.cache = new Map(data.cache);

        this.cleanupExpiredEntries();
      }

      if (data.stats) {
        this.hits = data.stats.hits || 0;
        this.misses = data.stats.misses || 0;
      }
    } catch (error) {
      console.warn("Erro ao carregar cache de embeddings:", error);
      this.cache = new Map();
    }
  }

  private generateKey(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.maxAge;
  }

  private evictLeastRecentlyUsed(): void {
    const entries = Array.from(this.cache.entries());

    entries.sort(([, a], [, b]) => a.last_access - b.last_access);

    const toRemove = Math.floor(this.maxEntries * 0.2);

    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.isDirty = true;
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.isDirty = true;
      console.log(
        `Cache cleanup: removidas ${removedCount} entradas expiradas`
      );
    }
  }

  private calculateCacheSize(): number {
    let size = 0;

    for (const entry of this.cache.values()) {
      size += entry.embedding.length * 8 + 100;
    }

    return size;
  }

  private scheduleCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredEntries();
      if (this.isDirty) {
        this.persistCache();
      }
    }, 60 * 60 * 1000);

    setInterval(() => {
      if (this.isDirty) {
        this.persistCache();
      }
    }, 5 * 60 * 1000);
  }

  async shutdown(): Promise<void> {
    await this.persistCache();
  }

  optimize(): void {
    const entries = Array.from(this.cache.entries());

    const accessCounts = entries
      .map(([, entry]) => entry.access_count)
      .sort((a, b) => a - b);
    const p25Index = Math.floor(accessCounts.length * 0.25);
    const p25Threshold = accessCounts[p25Index] || 1;

    let removedCount = 0;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const [key, entry] of this.cache.entries()) {
      if (
        entry.access_count <= p25Threshold &&
        entry.last_access < oneWeekAgo
      ) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.isDirty = true;
      console.log(
        `Cache otimizado: removidas ${removedCount} entradas pouco usadas`
      );
    }
  }
}
