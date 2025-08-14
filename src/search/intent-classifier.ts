import { QueryIntent } from "../types";

export class IntentClassifier {
  private symbolPatterns = [
    /\b(função|function|method|método)\s+(\w+)/i,
    /\b(class|classe)\s+(\w+)/i,
    /\b(component|componente)\s+(\w+)/i,
    /\b(hook|useState|useEffect|use\w+)/i,
    /\b(interface|type)\s+(\w+)/i,
  ];

  private filePatterns = [
    /\b(arquivo|file)\s+(\w+\.\w+)/i,
    /\b(\w+\.(ts|tsx|js|jsx|md|json))/i,
    /\bpath|caminho/i,
    /\bonde está|where is/i,
  ];

  private explanationPatterns = [
    /\b(como funciona|how does|como|how)/i,
    /\b(o que é|what is|que é)/i,
    /\b(explique|explain|explicar)/i,
    /\b(por que|why|porque)/i,
    /\b(quando|when|onde|where)/i,
  ];

  private howtoPatterns = [
    /\b(como fazer|how to|como usar|how to use)/i,
    /\b(tutorial|exemplo|example)/i,
    /\b(implementar|implement|criar|create)/i,
    /\b(configurar|configure|setup)/i,
    /\b(instalar|install)/i,
  ];

  private routePatterns = [
    /\b(rota|route|endpoint|api)/i,
    /\b(página|page|url|path)/i,
    /\b(navegação|navigation)/i,
    /\b(router|routing)/i,
  ];

  private errorPatterns = [
    /\b(erro|error|bug|falha|problema)/i,
    /\b(exception|exceção)/i,
    /\b(não funciona|not working|broken)/i,
    /\b(debug|debugging)/i,
    /\b(stack trace|stacktrace)/i,
  ];

  classifyIntent(query: string): QueryIntent {
    const queryLower = query.toLowerCase();
    const scores = this.calculateScores(queryLower);

    const maxScore = Math.max(...Object.values(scores));
    const maxType = Object.entries(scores).find(
      ([, score]) => score === maxScore
    )?.[0];

    const entities = this.extractEntities(query);
    const keywords = this.extractKeywords(queryLower);

    return {
      type: (maxType as QueryIntent["type"]) || "explanation",
      confidence: maxScore,
      entities,
      keywords,
    };
  }

  private calculateScores(query: string): Record<string, number> {
    const scores = {
      symbol: 0,
      file: 0,
      explanation: 0,
      howto: 0,
      route: 0,
      error: 0,
    };

    scores.symbol = this.calculatePatternScore(query, this.symbolPatterns);
    scores.file = this.calculatePatternScore(query, this.filePatterns);
    scores.explanation = this.calculatePatternScore(
      query,
      this.explanationPatterns
    );
    scores.howto = this.calculatePatternScore(query, this.howtoPatterns);
    scores.route = this.calculatePatternScore(query, this.routePatterns);
    scores.error = this.calculatePatternScore(query, this.errorPatterns);

    const maxRawScore = Math.max(...Object.values(scores));
    if (maxRawScore > 0) {
      Object.keys(scores).forEach((key) => {
        scores[key as keyof typeof scores] =
          scores[key as keyof typeof scores] / maxRawScore;
      });
    }

    if (maxRawScore === 0) {
      scores.explanation = 0.5;
    }

    return scores;
  }

  private calculatePatternScore(query: string, patterns: RegExp[]): number {
    let score = 0;

    for (const pattern of patterns) {
      if (pattern.test(query)) {
        score += 1;
        const matches = query.match(new RegExp(pattern.source, "gi"));
        if (matches && matches.length > 1) {
          score += matches.length * 0.2;
        }
      }
    }

    return score;
  }

  private extractEntities(query: string): string[] {
    const entities: string[] = [];

    const entityPatterns = [
      /\b(função|function|class|component|hook)\s+(\w+)/gi,
      /\b(\w+)\s*(função|function|class|component)/gi,
      /\b(\w+\.\w+)/g,
      /\b[A-Z]\w+/g,
      /\buse\w+/gi,
    ];

    for (const pattern of entityPatterns) {
      const matches = query.match(pattern);
      if (matches) {
        entities.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(entities)]
      .filter((entity) => entity.length > 2)
      .slice(0, 5);
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      "o",
      "a",
      "os",
      "as",
      "um",
      "uma",
      "de",
      "do",
      "da",
      "dos",
      "das",
      "em",
      "no",
      "na",
      "nos",
      "nas",
      "com",
      "por",
      "para",
      "é",
      "são",
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

    return query
      .split(/\s+/)
      .map((word) => word.replace(/[^\w]/g, "").toLowerCase())
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 10);
  }

  enhanceQuery(originalQuery: string, intent: QueryIntent): string[] {
    const queries = [originalQuery];

    switch (intent.type) {
      case "symbol":
        if (intent.entities.length > 0) {
          intent.entities.forEach((entity) => {
            queries.push(entity);
            queries.push(`export ${entity}`);
            queries.push(`import ${entity}`);
            queries.push(`${entity} function`);
            queries.push(`${entity} component`);
          });
        }
        break;

      case "file":
        intent.keywords.forEach((keyword) => {
          queries.push(`${keyword} file`);
          queries.push(`${keyword}.ts`);
          queries.push(`${keyword}.tsx`);
          queries.push(`${keyword}.js`);
        });
        break;

      case "howto":
        queries.push("example");
        queries.push("usage");
        queries.push("implement");
        intent.keywords.forEach((keyword) => {
          queries.push(`how to ${keyword}`);
          queries.push(`${keyword} example`);
        });
        break;

      case "error":
        queries.push("error");
        queries.push("exception");
        queries.push("try catch");
        intent.keywords.forEach((keyword) => {
          queries.push(`${keyword} error`);
          queries.push(`${keyword} exception`);
        });
        break;

      case "route":
        queries.push("route");
        queries.push("router");
        queries.push("path");
        queries.push("page");
        break;
    }

    return [...new Set(queries)].slice(0, 6);
  }
}
