import { BaseLLMProvider } from "./base-provider";
import { LLMResponse } from "../types";

export class MockLLMProvider extends BaseLLMProvider {
  name = "Mock LLM Provider";

  async generate(prompt: string, context?: string[]): Promise<LLMResponse> {
    const startTime = performance.now();

    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000)
    );

    const userMessage = this.extractUserMessage(prompt);
    const citations = this.extractCitations(userMessage, context || []);

    const response = this.generateMockResponse(userMessage, context || []);

    return {
      content: response,
      tokensUsed: this.getTokenCount?.(response) || 0,
      processingTime: Math.round(performance.now() - startTime),
      confidence: 0.8 + Math.random() * 0.2,
      citations,
    };
  }

  private extractUserMessage(prompt: string): string {
    const lines = prompt.split("\n");
    const userIndex = lines.findIndex((line) =>
      line.includes("PERGUNTA DO USUÁRIO:")
    );

    if (userIndex >= 0 && userIndex < lines.length - 2) {
      return lines[userIndex + 1] || "";
    }

    return prompt;
  }

  private generateMockResponse(userMessage: string, context: string[]): string {
    const message = userMessage.toLowerCase();

    if (message.includes("função") || message.includes("method")) {
      return this.generateFunctionResponse(context);
    }

    if (message.includes("component") || message.includes("componente")) {
      return this.generateComponentResponse(context);
    }

    if (message.includes("como") || message.includes("how")) {
      return this.generateHowToResponse(context);
    }

    if (message.includes("erro") || message.includes("error")) {
      return this.generateErrorResponse(context);
    }

    if (context.length === 0) {
      return "Não encontrei informações suficientes sobre isso no código indexado. Tente refinar sua busca ou verificar se o código foi indexado corretamente.";
    }

    return this.generateGenericResponse(context);
  }

  private generateFunctionResponse(context: string[]): string {
    if (context.length === 0) {
      return "Não encontrei definições de funções relacionadas à sua pergunta no código indexado.";
    }

    const fileExample = context[0].split("\n")[0] || "arquivo.ts";

    return `Encontrei algumas funções relacionadas no código:

**Principais funções identificadas:**
- Localizada em [${fileExample}:1-10]
- Utilizada para processamento de dados
- Retorna resultado processado

**Como usar:**
\`\`\`typescript
// Exemplo de uso baseado no código encontrado
const resultado = minhaFuncao(parametros);
\`\`\`

**Arquivos relacionados:**
- [${fileExample}:1-50] - Implementação principal
- Veja também os imports e exports para entender as dependências.`;
  }

  private generateComponentResponse(context: string[]): string {
    if (context.length === 0) {
      return "Não encontrei componentes relacionados à sua pergunta no código indexado.";
    }

    const fileExample = context[0].split("\n")[0] || "Component.tsx";

    return `Encontrei informações sobre componentes:

**Componente identificado:**
- Definido em [${fileExample}:1-30]
- Recebe props específicas do domínio
- Implementa lógica de renderização

**Props e uso:**
\`\`\`tsx
// Baseado no código analisado
<MeuComponente 
  prop1="valor"
  prop2={dados}
/>
\`\`\`

**Localização:** [${fileExample}:1-100]`;
  }

  private generateHowToResponse(context: string[]): string {
    return `**Como fazer:**

Com base no código indexado, aqui está o processo recomendado:

1. **Primeiro passo:** Configure conforme encontrado no código
2. **Implementação:** Use os padrões identificados 
3. **Verificação:** Teste conforme os exemplos

**Código de referência:**
Veja exemplos similares em: [exemplo.ts:1-20]

**Dicas importantes:**
- Siga os padrões já estabelecidos no projeto
- Verifique as dependências necessárias`;
  }

  private generateErrorResponse(context: string[]): string {
    return `**Análise do erro:**

Com base no código indexado, possíveis causas:

1. **Verificação de tipos:** Confira as interfaces definidas
2. **Imports/Exports:** Verifique se todas as dependências estão corretas
3. **Configuração:** Revise os arquivos de configuração

**Sugestões:**
- Consulte exemplos similares no código: [exemplo.ts:1-15]
- Verifique a documentação dos tipos utilizados

Se o erro persistir, verifique se todos os arquivos necessários foram indexados.`;
  }

  private generateGenericResponse(context: string[]): string {
    const fileExample = context[0]?.split("\n")[0] || "arquivo.ts";

    return `**Informações encontradas:**

Com base no código indexado, identifiquei:

- Implementação localizada em [${fileExample}:1-50]
- Padrões de uso estabelecidos no projeto
- Dependências e configurações relacionadas

**Próximos passos:**
1. Revise o código em [${fileExample}:1-100]
2. Verifique exemplos de uso existentes
3. Adapte conforme os padrões do projeto

Para mais detalhes específicos, refine sua pergunta com termos mais específicos.`;
  }
}
