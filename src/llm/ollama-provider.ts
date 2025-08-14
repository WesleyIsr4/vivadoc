import { LLMProvider, LLMResponse, Citation } from "../types";
import { BaseLLMProvider } from "./base-provider";

interface OllamaConfig {
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

interface OllamaRequest {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  system?: string;
}

interface OllamaResponse {
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseLLMProvider implements LLMProvider {
  public readonly name = "Ollama";
  private config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    super();

    this.config = {
      baseURL: config.baseURL || "http://localhost:11434",
      model: config.model || "llama3.2:3b",
      temperature: config.temperature ?? 0.1,
      maxTokens: config.maxTokens || 2000,
      timeout: config.timeout || 60000,
    };
  }

  async generate(prompt: string, context: string[] = []): Promise<LLMResponse> {
    const startTime = performance.now();

    try {
      await this.checkOllamaAvailable();

      const systemPrompt = this.buildSystemPrompt();
      const fullPrompt = this.buildPrompt(prompt, context);

      const request: OllamaRequest = {
        model: this.config.model,
        prompt: fullPrompt,
        system: systemPrompt,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false,
      };

      const response = await this.callOllama(request);
      const content = response.response || "";

      const citations = this.extractCitations(content, context);

      const confidence = this.calculateConfidence(content, citations, context);

      return {
        content: this.cleanResponse(content, context),
        tokensUsed: response.eval_count,
        processingTime: Math.round(performance.now() - startTime),
        confidence,
        citations,
      };
    } catch (error) {
      console.error("Erro na chamada Ollama:", error);

      return {
        content:
          "Desculpe, o modelo local não está disponível no momento. Verifique se o Ollama está rodando.",
        tokensUsed: 0,
        processingTime: Math.round(performance.now() - startTime),
        confidence: 0,
        citations: [],
      };
    }
  }

  async generateStream(
    prompt: string,
    context: string[] = []
  ): Promise<AsyncGenerator<string>> {
    await this.checkOllamaAvailable();

    const systemPrompt = this.buildSystemPrompt();
    const fullPrompt = this.buildPrompt(prompt, context);

    const request: OllamaRequest = {
      model: this.config.model,
      prompt: fullPrompt,
      system: systemPrompt,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: true,
    };

    return this.streamOllama(request);
  }

  private async checkOllamaAvailable(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseURL}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Ollama não disponível: ${response.status}`);
      }

      const data = (await response.json()) as any;
      const availableModels = data.models?.map((m: any) => m.name) || [];

      if (!availableModels.includes(this.config.model)) {
        console.warn(
          `⚠️ Modelo ${this.config.model} não encontrado. Modelos disponíveis:`,
          availableModels
        );

        if (availableModels.length > 0) {
          console.log(`🔄 Usando modelo ${availableModels[0]} como fallback`);
          this.config.model = availableModels[0];
        } else {
          throw new Error("Nenhum modelo disponível no Ollama");
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error("Ollama não está rodando. Inicie com: ollama serve");
      }
      throw error;
    }
  }

  private async callOllama(request: OllamaRequest): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as any;
        throw new Error(
          `Ollama API Error: ${response.status} - ${
            errorData.error || response.statusText
          }`
        );
      }

      return response.json() as Promise<OllamaResponse>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Timeout na chamada do Ollama");
      }

      throw error;
    }
  }

  private async *streamOllama(request: OllamaRequest): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Falha ao obter reader do stream");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line) as OllamaResponse;

                if (data.response) {
                  yield data.response;
                }

                if (data.done) {
                  return;
                }
              } catch (error) {}
            }
          }
        }
      } finally {
        reader.releaseLock();
        clearTimeout(timeoutId);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Timeout no stream do Ollama");
      }

      throw error;
    }
  }

  private buildSystemPrompt(): string {
    return `Você é um assistente especializado em documentação de código (Vivadoc).

RESPONSABILIDADES:
1. Analisar código e responder perguntas técnicas precisas
2. Sempre incluir citações [arquivo:linha] quando referenciar código
3. Explicar conceitos de programação de forma clara e didática
4. Sugerir melhorias e boas práticas quando apropriado

REGRAS OBRIGATÓRIAS:
- SEMPRE cite as fontes usando [arquivo:linha-linha] 
- Se não tiver informações suficientes, diga claramente
- Mantenha respostas concisas mas completas
- Use linguagem técnica apropriada em português
- Foque no código fornecido no contexto

FORMATO DE CITAÇÃO:
Use [arquivo.js:10-15] para referenciar linhas específicas do código.

IDIOMA: Português brasileiro`;
  }

  private calculateConfidence(
    content: string,
    citations: Citation[],
    context: string[]
  ): number {
    let confidence = 0.5;

    if (citations.length > 0) {
      confidence += Math.min(citations.length * 0.15, 0.4);
    }

    const contextUsed = context.some((ctx) => {
      const lines = ctx.split("\\n");
      return lines.some(
        (line) => content.includes(line.trim()) && line.trim().length > 10
      );
    });

    if (contextUsed) {
      confidence += 0.2;
    }

    if (content.length < 100) {
      confidence -= 0.2;
    }

    const genericPhrases = [
      "não posso ajudar",
      "não tenho informações",
      "preciso de mais",
      "não é possível",
    ];

    if (
      genericPhrases.some((phrase) => content.toLowerCase().includes(phrase))
    ) {
      confidence -= 0.3;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  getTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.checkOllamaAvailable();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseURL}/api/tags`);
      if (!response.ok) return [];

      const data = (await response.json()) as any;
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }

  updateConfig(newConfig: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
