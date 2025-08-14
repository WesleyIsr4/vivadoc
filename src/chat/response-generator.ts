import {
  SearchResult,
  ChatMessage,
  LLMProvider,
  ResponseConfig,
  QueryIntent,
  Citation,
} from "../types";
import { HybridSearch } from "../search/hybrid-search";
import { IntentClassifier } from "../search/intent-classifier";

export class ResponseGenerator {
  private search: HybridSearch;
  private llm: LLMProvider;
  private config: ResponseConfig;
  private intentClassifier: IntentClassifier;

  constructor(
    search: HybridSearch,
    llm: LLMProvider,
    config: Partial<ResponseConfig> = {}
  ) {
    this.search = search;
    this.llm = llm;
    this.intentClassifier = new IntentClassifier();
    this.config = {
      maxTokens: 2000,
      temperature: 0.1,
      requireCitations: true,
      noResponseThreshold: 0.3,
      language: "pt",
      ...config,
    };
  }

  async generateResponse(
    userMessage: string,
    intent?: QueryIntent,
    previousMessages?: ChatMessage[]
  ): Promise<ChatMessage> {
    const startTime = performance.now();

    try {
      const classifiedIntent =
        intent || this.intentClassifier.classifyIntent(userMessage);

      const searchResults = await this.searchRelevantContext(
        userMessage,
        classifiedIntent
      );

      if (!this.hasSufficientContext(searchResults)) {
        return this.createNoResponseMessage(userMessage, searchResults);
      }

      const context = this.prepareContext(searchResults, previousMessages);

      const llmResponse = await this.llm.generate(userMessage, context);

      if (
        llmResponse.confidence &&
        llmResponse.confidence < this.config.noResponseThreshold
      ) {
        return this.createLowConfidenceMessage(userMessage, searchResults);
      }

      const responseMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: "assistant",
        content: llmResponse.content,
        timestamp: new Date(),
        citations: this.enhanceCitations(llmResponse.citations, searchResults),
        metadata: {
          processingTime: Math.round(performance.now() - startTime),
          tokensUsed: llmResponse.tokensUsed,
          confidence: llmResponse.confidence,
        },
      };

      return responseMessage;
    } catch (error) {
      console.error("Erro ao gerar resposta:", error);
      return this.createErrorMessage(userMessage);
    }
  }

  private async searchRelevantContext(
    userMessage: string,
    intent: QueryIntent
  ): Promise<SearchResult[]> {
    const expandedQueries = this.intentClassifier.enhanceQuery(
      userMessage,
      intent
    );

    const allResults: SearchResult[] = [];

    for (const queryText of expandedQueries) {
      try {
        const query = {
          text: queryText,
          type: intent.type,
          filters: this.createFiltersFromIntent(intent),
        };

        const results = await this.search.search(query, 8);

        const boostedResults = results.map((result) => ({
          ...result,
          score: result.score * (0.5 + intent.confidence * 0.5),
          relevance: result.relevance * (0.5 + intent.confidence * 0.5),
        }));

        allResults.push(...boostedResults);
      } catch (error) {
        console.warn("Erro na busca:", error);
      }
    }

    const uniqueResults = this.deduplicateResults(allResults);
    return uniqueResults.slice(0, 6);
  }

  private createFiltersFromIntent(intent: QueryIntent) {
    const filters: any = {};

    switch (intent.type) {
      case "symbol":
        filters.type = ["function", "component", "hook", "service"];
        break;
      case "file":
        filters.type = ["file"];
        break;
      case "route":
        filters.type = ["route", "file"];
        filters.tags = ["route", "router", "navigation"];
        break;
      case "test":
        filters.type = ["test"];
        filters.tags = ["test"];
        break;
      case "howto":
        break;
      case "error":
        filters.tags = ["error", "exception", "try", "catch"];
        break;
    }

    if (intent.entities.length > 0) {
      const fileEntities = intent.entities.filter(
        (entity) =>
          entity.includes(".") || entity.match(/\.(ts|tsx|js|jsx|md|json)$/i)
      );

      if (fileEntities.length > 0) {
        filters.filePath = fileEntities[0];
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results
      .filter((result) => {
        if (seen.has(result.chunk.id)) {
          return false;
        }
        seen.add(result.chunk.id);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }

  private prepareContext(
    searchResults: SearchResult[],
    previousMessages?: ChatMessage[]
  ): string[] {
    const context: string[] = [];

    searchResults.forEach((result, index) => {
      const chunk = result.chunk;
      const contextEntry = `
ARQUIVO: ${chunk.filePath}
LINHAS: ${chunk.startLine}-${chunk.endLine}
LINGUAGEM: ${chunk.language}
TIPO: ${chunk.metadata.type}
CONTEÚDO:
${chunk.content}
      `.trim();

      context.push(contextEntry);
    });

    if (previousMessages && previousMessages.length > 0) {
      const recentMessages = previousMessages.slice(-3);
      const messageContext = recentMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n");

      context.push(`CONTEXTO DA CONVERSA:\n${messageContext}`);
    }

    return context;
  }

  private hasSufficientContext(searchResults: SearchResult[]): boolean {
    if (searchResults.length === 0) return false;

    const bestScore = searchResults[0]?.score || 0;
    return bestScore > 0.1;
  }

  private enhanceCitations(
    llmCitations: Citation[],
    searchResults: SearchResult[]
  ): Citation[] {
    const enhanced: Citation[] = [];

    enhanced.push(...llmCitations);

    searchResults.forEach((result) => {
      const exists = enhanced.some(
        (cit) =>
          cit.filePath === result.chunk.filePath &&
          cit.startLine === result.chunk.startLine
      );

      if (!exists) {
        enhanced.push({
          filePath: result.chunk.filePath,
          startLine: result.chunk.startLine,
          endLine: result.chunk.endLine,
          content: result.chunk.content.substring(0, 200) + "...",
        });
      }
    });

    return enhanced;
  }

  private createNoResponseMessage(
    userMessage: string,
    searchResults: SearchResult[]
  ): ChatMessage {
    let suggestions = [
      "Tente usar termos mais específicos",
      "Verifique se o código foi indexado corretamente",
      "Use nomes de funções, classes ou arquivos específicos",
    ];

    if (searchResults.length > 0) {
      const files = searchResults
        .map((r) => r.chunk.filePath.split("/").pop())
        .slice(0, 3);
      suggestions.push(`Talvez você esteja procurando em: ${files.join(", ")}`);
    }

    return {
      id: this.generateMessageId(),
      role: "assistant",
      content: `Não encontrei informações suficientes sobre "${userMessage}" no código indexado.

**Sugestões:**
${suggestions.map((s) => `• ${s}`).join("\n")}

Tente refinar sua pergunta ou verificar se os arquivos relevantes foram indexados.`,
      timestamp: new Date(),
      citations: [],
      metadata: {
        processingTime: 0,
        confidence: 0,
      },
    };
  }

  private createLowConfidenceMessage(
    userMessage: string,
    searchResults: SearchResult[]
  ): ChatMessage {
    const fileHints = searchResults
      .slice(0, 3)
      .map(
        (r) => `• ${r.chunk.filePath}:${r.chunk.startLine}-${r.chunk.endLine}`
      )
      .join("\n");

    return {
      id: this.generateMessageId(),
      role: "assistant",
      content: `Encontrei algumas informações relacionadas a "${userMessage}", mas não tenho confiança suficiente para dar uma resposta precisa.

**Arquivos que podem ser relevantes:**
${fileHints}

Tente ser mais específico em sua pergunta ou consulte diretamente esses arquivos.`,
      timestamp: new Date(),
      citations: searchResults.slice(0, 3).map((r) => ({
        filePath: r.chunk.filePath,
        startLine: r.chunk.startLine,
        endLine: r.chunk.endLine,
        content: r.chunk.content.substring(0, 200) + "...",
      })),
      metadata: {
        processingTime: 0,
        confidence: 0.2,
      },
    };
  }

  private createErrorMessage(userMessage: string): ChatMessage {
    return {
      id: this.generateMessageId(),
      role: "assistant",
      content: `Desculpe, ocorreu um erro interno ao processar sua pergunta: "${userMessage}".

Tente novamente em alguns instantes. Se o problema persistir, verifique se o sistema está funcionando corretamente.`,
      timestamp: new Date(),
      citations: [],
      metadata: {
        processingTime: 0,
        confidence: 0,
      },
    };
  }

  async generateStreamingResponse(
    userMessage: string,
    intent?: QueryIntent,
    previousMessages?: ChatMessage[],
    onChunk?: (chunk: string) => void
  ): Promise<ChatMessage> {
    const startTime = performance.now();

    try {
      const classifiedIntent =
        intent || this.intentClassifier.classifyIntent(userMessage);

      const searchResults = await this.searchRelevantContext(
        userMessage,
        classifiedIntent
      );

      if (!this.hasSufficientContext(searchResults)) {
        const noResponseMessage = this.createNoResponseMessage(
          userMessage,
          searchResults
        );
        if (onChunk) {
          onChunk(noResponseMessage.content);
        }
        return noResponseMessage;
      }

      const context = this.prepareContext(searchResults, previousMessages);

      let streamingContent = "";
      let llmResponse;

      if (this.llm.generateStream) {
        const streamGenerator = await this.llm.generateStream(
          userMessage,
          context
        );

        for await (const chunk of streamGenerator) {
          streamingContent += chunk;
          if (onChunk) {
            onChunk(chunk);
          }
        }

        llmResponse = {
          content: streamingContent,
          tokensUsed: Math.ceil(streamingContent.length / 4),
          processingTime: Math.round(performance.now() - startTime),
          confidence: 0.8,
          citations: [],
        };
      } else {
        llmResponse = await this.llm.generate(userMessage, context);

        if (onChunk) {
          const words = llmResponse.content.split(" ");
          for (const word of words) {
            onChunk(word + " ");
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }

      if (
        llmResponse.confidence &&
        llmResponse.confidence < this.config.noResponseThreshold
      ) {
        const lowConfidenceMessage = this.createLowConfidenceMessage(
          userMessage,
          searchResults
        );
        if (onChunk && !streamingContent) {
          onChunk(lowConfidenceMessage.content);
        }
        return lowConfidenceMessage;
      }

      const responseMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: "assistant",
        content: llmResponse.content,
        timestamp: new Date(),
        citations: this.enhanceCitations(llmResponse.citations, searchResults),
        metadata: {
          processingTime: Math.round(performance.now() - startTime),
          tokensUsed: llmResponse.tokensUsed,
          confidence: llmResponse.confidence,
        },
      };

      return responseMessage;
    } catch (error) {
      console.error("Erro ao gerar resposta em streaming:", error);
      const errorMessage = this.createErrorMessage(userMessage);
      if (onChunk) {
        onChunk(errorMessage.content);
      }
      return errorMessage;
    }
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
