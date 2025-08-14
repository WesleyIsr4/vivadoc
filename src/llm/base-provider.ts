import { LLMProvider, LLMResponse, Citation } from "../types";

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;

  abstract generate(prompt: string, context?: string[]): Promise<LLMResponse>;

  async generateStream(
    prompt: string,
    context?: string[]
  ): Promise<AsyncGenerator<string>> {
    const response = await this.generate(prompt, context);
    return this.createStreamFromText(response.content);
  }

  private async *createStreamFromText(text: string): AsyncGenerator<string> {
    const words = text.split(" ");
    for (const word of words) {
      yield word + " ";
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  getTokenCount?(text: string): number {
    return Math.ceil(text.length / 4);
  }

  protected extractCitations(content: string, context: string[]): Citation[] {
    const citations: Citation[] = [];
    const citationRegex = /\[([^\]]+):(\d+)-(\d+)\]/g;

    let match;
    while ((match = citationRegex.exec(content)) !== null) {
      const [, filePath, startLine, endLine] = match;

      const chunkContent =
        context.find(
          (chunk) =>
            chunk.includes(filePath) &&
            chunk.includes(`${startLine}-${endLine}`)
        ) || "";

      citations.push({
        filePath,
        startLine: parseInt(startLine),
        endLine: parseInt(endLine),
        content: chunkContent.substring(0, 200) + "...",
      });
    }

    return citations;
  }

  protected buildPrompt(userMessage: string, context: string[]): string {
    const systemPrompt = `Você é um assistente especializado em análise de código e documentação. 

INSTRUÇÕES IMPORTANTES:
1. Responda APENAS com base no contexto fornecido
2. SEMPRE inclua citações no formato [arquivo:linha-linha] para cada afirmação
3. Se não houver informação suficiente, responda "Não encontrei informações suficientes sobre isso no código indexado."
4. Mantenha respostas concisas e objetivas
5. Use português brasileiro
6. Foque em informações práticas e acionáveis

CONTEXTO DO CÓDIGO:
${context.map((chunk, i) => `--- Chunk ${i + 1} ---\n${chunk}`).join("\n\n")}

PERGUNTA DO USUÁRIO:
${userMessage}

RESPOSTA:`;

    return systemPrompt;
  }

  protected cleanResponse(content: string, _context: string[]): string {
    let cleaned = content.replace(/\n{3,}/g, "\n\n");

    cleaned = cleaned.trim();

    cleaned = cleaned.replace(
      /\[([^\]]+):(\d+)-(\d+)\]/g,
      (_match, file, start, end) => {
        return `[${file}:${start}-${end}]`;
      }
    );

    return cleaned;
  }
}
