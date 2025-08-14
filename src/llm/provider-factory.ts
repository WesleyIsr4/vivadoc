import { LLMProvider } from "../types";
import { MockLLMProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai-provider";
import { OllamaProvider } from "./ollama-provider";

export type LLMProviderType = "mock" | "openai" | "ollama" | "auto";

export interface LLMProviderConfig {
  type: LLMProviderType;
  openai?: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseURL?: string;
  };
  ollama?: {
    baseURL?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
  mock?: {
    delay?: number;
    enableRealResponses?: boolean;
  };
}

export class LLMProviderFactory {
  static async create(config: LLMProviderConfig): Promise<LLMProvider> {
    switch (config.type) {
      case "openai":
        return new OpenAIProvider(config.openai);

      case "ollama":
        return new OllamaProvider(config.ollama);

      case "mock":
        return new MockLLMProvider();

      case "auto":
        return await this.createBestAvailable(config);

      default:
        throw new Error(`Tipo de provider não suportado: ${config.type}`);
    }
  }

  static async createBestAvailable(
    config: LLMProviderConfig
  ): Promise<LLMProvider> {
    console.log("🔍 Detectando melhor provider LLM disponível...");

    if (process.env.OPENAI_API_KEY || config.openai?.apiKey) {
      try {
        const provider = new OpenAIProvider(config.openai);
        if (provider.isConfigured()) {
          console.log("✅ Usando OpenAI provider");
          return provider;
        }
      } catch (error) {
        console.warn("⚠️ OpenAI provider não disponível:", error);
      }
    }

    try {
      const provider = new OllamaProvider(config.ollama);
      const isAvailable = await provider.isAvailable();

      if (isAvailable) {
        const models = await provider.listModels();
        console.log(`✅ Usando Ollama provider com modelos:`, models);
        return provider;
      }
    } catch (error) {
      console.warn("⚠️ Ollama provider não disponível:", error);
    }

    console.log("🎭 Usando Mock provider (fallback)");
    return new MockLLMProvider();
  }

  static createDefault(): Promise<LLMProvider> {
    return this.create({
      type: "auto",
      openai: {
        model: "gpt-4o-mini",
        temperature: 0.1,
        maxTokens: 2000,
      },
      ollama: {
        model: "llama3.2:3b",
        temperature: 0.1,
        maxTokens: 2000,
      },
    });
  }

  static async getAvailableProviders(): Promise<{
    openai: { available: boolean; configured: boolean };
    ollama: { available: boolean; models: string[] };
    mock: { available: boolean };
  }> {
    const result = {
      openai: { available: false, configured: false },
      ollama: { available: false, models: [] as string[] },
      mock: { available: true },
    };

    try {
      const openaiProvider = new OpenAIProvider();
      result.openai.configured = openaiProvider.isConfigured();
      result.openai.available = result.openai.configured;
    } catch {}

    try {
      const ollamaProvider = new OllamaProvider();
      result.ollama.available = await ollamaProvider.isAvailable();

      if (result.ollama.available) {
        result.ollama.models = await ollamaProvider.listModels();
      }
    } catch {}

    return result;
  }

  static validateConfig(config: LLMProviderConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.type) {
      errors.push("Tipo de provider é obrigatório");
    }

    if (config.type === "openai") {
      if (!config.openai?.apiKey && !process.env.OPENAI_API_KEY) {
        errors.push("API key do OpenAI é obrigatória");
      }
    }

    if (config.type === "ollama") {
      if (config.ollama?.baseURL && !this.isValidURL(config.ollama.baseURL)) {
        errors.push("URL base do Ollama inválida");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static loadFromEnv(): LLMProviderConfig {
    const config: LLMProviderConfig = {
      type: (process.env.VIVADOC_LLM_PROVIDER as LLMProviderType) || "auto",
    };

    if (process.env.OPENAI_API_KEY) {
      config.openai = {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.1"),
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "2000"),
        baseURL: process.env.OPENAI_BASE_URL,
      };
    }

    config.ollama = {
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "llama3.2:3b",
      temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || "0.1"),
      maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || "2000"),
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || "60000"),
    };

    return config;
  }
}
