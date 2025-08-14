import { LLMProvider, LLMResponse, Citation } from "../types";
import { BaseLLMProvider } from "./base-provider";

interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  baseURL?: string;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider extends BaseLLMProvider implements LLMProvider {
  public readonly name = "OpenAI";
  private config: OpenAIConfig;

  constructor(config: Partial<OpenAIConfig> = {}) {
    super();

    this.config = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY || "",
      model: config.model || "gpt-4o-mini",
      temperature: config.temperature ?? 0.1,
      maxTokens: config.maxTokens || 2000,
      baseURL: config.baseURL || "https://api.openai.com/v1",
    };

    if (!this.config.apiKey) {
      console.warn(
        "⚠️ OpenAI API key não configurada. Use OPENAI_API_KEY ou passe no constructor."
      );
    }
  }

  async generate(prompt: string, context: string[] = []): Promise<LLMResponse> {
    const startTime = performance.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const fullPrompt = this.buildPrompt(prompt, context);

      const messages: OpenAIMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: fullPrompt },
      ];

      const response = await this.callOpenAI(messages);
      const content = response.choices[0]?.message?.content || "";

      const citations = this.extractCitations(content, context);

      const confidence = this.calculateConfidence(content, citations, context);

      return {
        content: this.cleanResponse(content, context),
        tokensUsed: response.usage?.total_tokens,
        processingTime: Math.round(performance.now() - startTime),
        confidence,
        citations,
      };
    } catch (error) {
      console.error("Erro na chamada OpenAI:", error);

      return {
        content:
          "Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.",
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
    const systemPrompt = this.buildSystemPrompt();
    const fullPrompt = this.buildPrompt(prompt, context);

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: fullPrompt },
    ];

    return this.streamOpenAI(messages);
  }

  private async callOpenAI(messages: OpenAIMessage[]): Promise<OpenAIResponse> {
    if (!this.config.apiKey) {
      throw new Error("OpenAI API key não configurada");
    }

    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as any;
      throw new Error(
        `OpenAI API Error: ${response.status} - ${
          errorData.error?.message || response.statusText
        }`
      );
    }

    return response.json() as Promise<OpenAIResponse>;
  }

  private async *streamOpenAI(
    messages: OpenAIMessage[]
  ): AsyncGenerator<string> {
    if (!this.config.apiKey) {
      throw new Error("OpenAI API key não configurada");
    }

    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${response.status}`);
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
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            if (data === "[DONE]") {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch (error) {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildSystemPrompt(): string {
    return `Você é um assistente especializado em documentação de código (Vivadoc).

**RESPONSABILIDADES:**
1. Analisar código e responder perguntas técnicas precisas
2. Sempre incluir citações [arquivo:linha] quando referenciar código
3. Explicar conceitos de programação de forma clara e didática
4. Sugerir melhorias e boas práticas quando apropriado

**REGRAS OBRIGATÓRIAS:**
- SEMPRE cite as fontes usando [arquivo:linha-linha] 
- Se não tiver informações suficientes, diga claramente
- Mantenha respostas concisas mas completas
- Use linguagem técnica apropriada em português
- Foque no código fornecido no contexto

**FORMATO DE CITAÇÃO:**
Use [arquivo.js:10-15] para referenciar linhas específicas do código.

**IDIOMA:** Português brasileiro`;
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

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  updateConfig(newConfig: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
