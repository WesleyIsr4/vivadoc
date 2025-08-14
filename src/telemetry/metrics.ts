import { performance } from "perf_hooks";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface MetricEvent {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SessionMetrics {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  events: MetricEvent[];
  userAgent?: string;
  version?: string;
}

export class TelemetryCollector {
  private metrics: MetricEvent[] = [];
  private sessionId: string;
  private enabled: boolean;
  private metricsFile: string;

  constructor(projectRoot: string, enabled = false) {
    this.sessionId = this.generateSessionId();
    this.enabled = enabled;
    this.metricsFile = join(projectRoot, ".vivadoc", "metrics.jsonl");
  }

  recordIndexingTime(
    durationMs: number,
    filesCount: number,
    chunksCount: number
  ): void {
    this.record("indexing.duration", durationMs, {
      files: filesCount.toString(),
      chunks: chunksCount.toString(),
    });
  }

  recordSearchLatency(
    durationMs: number,
    queryType: string,
    resultsCount: number
  ): void {
    this.record("search.latency", durationMs, {
      type: queryType,
      results: resultsCount.toString(),
    });
  }

  recordLLMLatency(
    durationMs: number,
    provider: string,
    tokensUsed?: number
  ): void {
    this.record("llm.latency", durationMs, {
      provider,
      tokens: tokensUsed?.toString() || "unknown",
    });
  }

  recordChatMessage(
    responseTime: number,
    confidence: number,
    citationsCount: number
  ): void {
    this.record("chat.message", responseTime, {
      confidence: confidence.toString(),
      citations: citationsCount.toString(),
    });
  }

  recordError(error: string, component: string): void {
    this.record("error.occurred", 1, {
      error: error.substring(0, 100),
      component,
    });
  }

  recordUserFeedback(messageId: string, rating: "positive" | "negative"): void {
    this.record("user.feedback", rating === "positive" ? 1 : 0, {
      messageId: messageId.substring(0, 10),
    });
  }

  recordCitationClick(filePath: string): void {
    const fileName = filePath.split("/").pop() || "unknown";
    this.record("citation.click", 1, {
      file: fileName,
    });
  }

  recordCacheHit(cacheType: string): void {
    this.record("cache.hit", 1, { type: cacheType });
  }

  recordCacheMiss(cacheType: string): void {
    this.record("cache.miss", 1, { type: cacheType });
  }

  recordMemoryUsage(usageMB: number): void {
    this.record("system.memory", usageMB);
  }

  recordDiskUsage(usageMB: number): void {
    this.record("system.disk", usageMB);
  }

  record(
    name: string,
    value: number,
    tags?: Record<string, string>,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled) return;

    const event: MetricEvent = {
      name,
      value,
      timestamp: new Date(),
      tags,
      metadata,
    };

    this.metrics.push(event);

    if (this.metrics.length % 10 === 0) {
      this.flush();
    }
  }

  startTimer(name: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.record(`${name}.duration`, duration);
    };
  }

  async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const end = this.startTimer(name);
    try {
      const result = await fn();
      end();
      return result;
    } catch (error) {
      end();
      this.recordError((error as Error).message, name);
      throw error;
    }
  }

  getMetrics(): MetricEvent[] {
    return [...this.metrics];
  }

  getSessionSummary(): {
    duration: number;
    eventsCount: number;
    errorCount: number;
    averageSearchLatency: number;
    averageLLMLatency: number;
  } {
    const now = new Date().getTime();
    const firstEvent = this.metrics[0];
    const duration = firstEvent ? now - firstEvent.timestamp.getTime() : 0;

    const errors = this.metrics.filter((m) => m.name === "error.occurred");
    const searches = this.metrics.filter((m) => m.name === "search.latency");
    const llmCalls = this.metrics.filter((m) => m.name === "llm.latency");

    return {
      duration,
      eventsCount: this.metrics.length,
      errorCount: errors.length,
      averageSearchLatency:
        searches.length > 0
          ? searches.reduce((sum, m) => sum + m.value, 0) / searches.length
          : 0,
      averageLLMLatency:
        llmCalls.length > 0
          ? llmCalls.reduce((sum, m) => sum + m.value, 0) / llmCalls.length
          : 0,
    };
  }

  flush(): void {
    if (!this.enabled || this.metrics.length === 0) return;

    try {
      const metricsToWrite = [...this.metrics];
      this.metrics = [];

      const lines =
        metricsToWrite
          .map((metric) =>
            JSON.stringify({
              ...metric,
              sessionId: this.sessionId,
            })
          )
          .join("\n") + "\n";

      writeFileSync(this.metricsFile, lines, { flag: "a" });
    } catch (error) {
      console.warn("Failed to write telemetry data:", error);
    }
  }

  exportAnonymizedSummary(): {
    version: string;
    sessionDuration: number;
    commandsUsed: string[];
    averagePerformance: {
      indexing: number;
      search: number;
      llm: number;
    };
    errorTypes: string[];
    stackDetected?: string;
  } {
    const summary = this.getSessionSummary();
    const indexingEvents = this.metrics.filter(
      (m) => m.name === "indexing.duration"
    );
    const stackEvents = this.metrics.find((m) => m.name === "stack.detected");

    return {
      version: process.env.npm_package_version || "1.0.0",
      sessionDuration: summary.duration,
      commandsUsed: [...new Set(this.metrics.map((m) => m.name.split(".")[0]))],
      averagePerformance: {
        indexing:
          indexingEvents.length > 0
            ? indexingEvents.reduce((sum, m) => sum + m.value, 0) /
              indexingEvents.length
            : 0,
        search: summary.averageSearchLatency,
        llm: summary.averageLLMLatency,
      },
      errorTypes: [
        ...new Set(
          this.metrics
            .filter((m) => m.name === "error.occurred")
            .map((m) => m.tags?.component || "unknown")
        ),
      ],
      stackDetected: stackEvents?.tags?.stack,
    };
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
  }

  static create(projectRoot: string, userConsent = false): TelemetryCollector {
    const consentFile = join(projectRoot, ".vivadoc", "telemetry-consent");
    const enabled = userConsent || existsSync(consentFile);

    return new TelemetryCollector(projectRoot, enabled);
  }
}

let globalTelemetry: TelemetryCollector | null = null;

export function getTelemetry(): TelemetryCollector | null {
  return globalTelemetry;
}

export function initTelemetry(
  projectRoot: string,
  enabled = false
): TelemetryCollector {
  globalTelemetry = TelemetryCollector.create(projectRoot, enabled);
  return globalTelemetry;
}

export function recordMetric(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  globalTelemetry?.record(name, value, tags);
}
