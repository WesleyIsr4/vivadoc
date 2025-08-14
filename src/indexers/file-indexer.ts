import {
  Chunk,
  ChunkMetadata,
  TypeScriptTypeInfo,
  ParameterInfo,
  PropertyInfo,
} from "../types";
import { readFile, stat } from "fs/promises";
import { extname } from "path";
import { createHash } from "crypto";

export class FileIndexer {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly maxFileSize: number;

  constructor(chunkSize = 1000, chunkOverlap = 200, maxFileSize = 1024 * 1024) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.maxFileSize = maxFileSize;
  }

  async indexFile(filePath: string): Promise<Chunk[]> {
    try {
      const stats = await stat(filePath);

      if (!stats.isFile()) {
        return [];
      }

      if (stats.size > this.maxFileSize) {
        console.warn(
          `Arquivo muito grande ignorado: ${filePath} (${stats.size} bytes)`
        );
        return [];
      }

      const content = await readFile(filePath, "utf-8");
      const language = this.detectLanguage(filePath);

      if (!this.shouldIndexFile(filePath, language)) {
        return [];
      }

      return await this.createChunks(filePath, content, language);
    } catch (error) {
      console.warn(`Erro ao indexar arquivo ${filePath}:`, error);
      return [];
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".d.ts": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".md": "markdown",
      ".mdx": "markdown",
      ".json": "json",
      ".jsonc": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".css": "css",
      ".scss": "scss",
      ".sass": "sass",
      ".less": "less",
      ".html": "html",
      ".vue": "vue",
      ".svelte": "svelte",
    };

    return languageMap[ext] || "text";
  }

  private shouldIndexFile(filePath: string, language: string): boolean {
    const ignoredPatterns = [
      /node_modules/,
      /\.git/,
      /\.next/,
      /dist/,
      /build/,
      /out/,
      /coverage/,
      /\.DS_Store/,
      /\.env/,
      /\.log$/,
    ];

    if (ignoredPatterns.some((pattern) => pattern.test(filePath))) {
      return false;
    }

    const supportedLanguages = [
      "typescript",
      "javascript",
      "markdown",
      "json",
      "yaml",
      "css",
      "scss",
      "less",
      "html",
      "vue",
      "svelte",
    ];
    return supportedLanguages.includes(language);
  }

  private async createChunks(
    filePath: string,
    content: string,
    language: string
  ): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    const lines = content.split("\n");

    if (lines.length === 0) return chunks;

    let currentChunk: string[] = [];
    let currentLineNumber = 1;
    let chunkId = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);

      const currentChunkSize = currentChunk.join("\n").length;
      const isLastLine = i === lines.length - 1;

      if (currentChunkSize >= this.chunkSize || isLastLine) {
        const chunkContent = currentChunk.join("\n");
        const chunk = this.createChunk(
          chunkId++,
          chunkContent,
          filePath,
          currentLineNumber,
          i + 1,
          language
        );

        chunks.push(chunk);

        if (!isLastLine) {
          const overlapLines = this.calculateOverlapLines(currentChunk);
          currentChunk = overlapLines;
          currentLineNumber = i - overlapLines.length + 2;
        }

        if (chunks.length % 10 === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    }

    return chunks;
  }

  private calculateOverlapLines(chunk: string[]): string[] {
    if (chunk.length <= this.chunkOverlap) {
      return chunk;
    }

    const overlapSize = Math.min(this.chunkOverlap, chunk.length);
    return chunk.slice(-overlapSize);
  }

  private createChunk(
    id: number,
    content: string,
    filePath: string,
    startLine: number,
    endLine: number,
    language: string
  ): Chunk {
    const chunkContent = content.trim();
    const hash = this.createHash(chunkContent + filePath + startLine + endLine);

    const metadata: ChunkMetadata = {
      type: this.detectChunkType(chunkContent, language),
      tags: this.extractTags(chunkContent, language),
      visibility: this.detectVisibility(chunkContent, language),
      exports: this.extractExports(chunkContent, language),
      imports: this.extractImports(chunkContent, language),
      types:
        language === "typescript"
          ? this.extractTypeScriptTypes(chunkContent)
          : undefined,
      generics:
        language === "typescript"
          ? this.extractGenerics(chunkContent)
          : undefined,
      isAsync: this.detectAsync(chunkContent, language),
      returnType:
        language === "typescript"
          ? this.extractReturnType(chunkContent)
          : undefined,
      parameters:
        language === "typescript"
          ? this.extractParameters(chunkContent)
          : undefined,
    };

    return {
      id: `${filePath}:${startLine}-${endLine}`,
      content: chunkContent,
      filePath,
      startLine,
      endLine,
      language,
      metadata,
      hash,
    };
  }

  private detectChunkType(
    content: string,
    language: string
  ): ChunkMetadata["type"] {
    if (language === "typescript" || language === "javascript") {
      if (language === "typescript") {
        if (/\binterface\s+\w+/.test(content)) {
          return "interface";
        }
        if (/\btype\s+\w+\s*=/.test(content)) {
          return "type";
        }
        if (/\benum\s+\w+/.test(content)) {
          return "enum";
        }
        if (/\bnamespace\s+\w+/.test(content)) {
          return "namespace";
        }
        if (/\bclass\s+\w+/.test(content)) {
          return "class";
        }
      }

      if (content.includes("export default") || content.includes("export {")) {
        if (content.match(/React\.|useState|useEffect|JSX/)) {
          return "component";
        }
      }
      if (content.includes("function") || content.includes("=>")) {
        return "function";
      }
      if (
        content.includes("useState") ||
        content.includes("useEffect") ||
        /\buse[A-Z]\w+/.test(content)
      ) {
        return "hook";
      }
      if (content.includes("class") && content.includes("Service")) {
        return "service";
      }
      if (content.match(/\/api\//)) {
        return "route";
      }
      if (
        content.includes("test") ||
        content.includes("describe") ||
        content.includes("it(") ||
        content.includes("expect(") ||
        content.includes(".spec.") ||
        content.includes(".test.")
      ) {
        return "test";
      }
    }

    if (language === "markdown") {
      if (content.includes("# ")) {
        return "file";
      }
    }

    return "file";
  }

  private extractTags(content: string, language: string): string[] {
    const tags: string[] = [];

    if (language === "typescript" || language === "javascript") {
      if (content.match(/React\.|import.*react/i)) tags.push("react");
      if (content.match(/Next\.|from.*next/i)) tags.push("nextjs");
      if (content.match(/Vue\.|import.*vue/i)) tags.push("vue");
      if (content.match(/Angular|@angular/i)) tags.push("angular");

      if (language === "typescript") {
        if (content.includes("interface")) tags.push("interface");
        if (content.includes("type ")) tags.push("type");
        if (content.includes("enum ")) tags.push("enum");
        if (content.includes("namespace")) tags.push("namespace");
        if (content.match(/\w+<.*>/)) tags.push("generic");
        if (content.includes("implements")) tags.push("implements");
        if (content.includes("extends")) tags.push("extends");
      }

      if (content.includes("async")) tags.push("async");
      if (content.includes("await")) tags.push("await");
      if (content.includes("Promise")) tags.push("promise");

      if (content.match(/test|describe|it\(|expect/)) tags.push("test");

      if (content.match(/fetch|axios|api/i)) tags.push("api");
      if (content.match(/express|fastify|server/i)) tags.push("server");

      if (content.match(/prisma|mongoose|sequelize|database/i))
        tags.push("database");

      if (content.includes("utils") || content.includes("helper"))
        tags.push("utility");
    }

    return tags;
  }

  private detectVisibility(
    content: string,
    language: string
  ): ChunkMetadata["visibility"] {
    if (language === "typescript" || language === "javascript") {
      if (content.includes("private ")) return "private";
      if (content.includes("protected ")) return "protected";
      if (content.includes("readonly ")) return "readonly";
      if (content.includes("export ")) return "public";
      if (content.includes("internal")) return "internal";
    }
    return "public";
  }

  private extractExports(content: string, language: string): string[] {
    if (language !== "typescript" && language !== "javascript") return [];

    const exports: string[] = [];
    const exportRegex =
      /export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  private extractImports(content: string, language: string): string[] {
    if (language !== "typescript" && language !== "javascript") return [];

    const imports: string[] = [];
    const importRegex = /import\s+(?:\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  private createHash(content: string): string {
    return createHash("sha256").update(content).digest("hex").substring(0, 8);
  }

  private extractTypeScriptTypes(content: string): TypeScriptTypeInfo[] {
    const types: TypeScriptTypeInfo[] = [];

    const interfaceRegex =
      /interface\s+(\w+)(?:\s*extends\s+([\w,\s]+))?\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const [, name, extendsClause, body] = match;
      types.push({
        name,
        kind: "interface",
        extends: extendsClause
          ? extendsClause.split(",").map((s) => s.trim())
          : undefined,
        properties: this.extractProperties(body || ""),
      });
    }

    const typeRegex = /type\s+(\w+)(?:<[^>]*>)?\s*=\s*([^;\n]+)/g;
    while ((match = typeRegex.exec(content)) !== null) {
      const [, name] = match;
      types.push({
        name,
        kind: "type",
      });
    }

    const enumRegex = /enum\s+(\w+)\s*\{([^}]*)\}/g;
    while ((match = enumRegex.exec(content)) !== null) {
      const [, name] = match;
      types.push({
        name,
        kind: "enum",
      });
    }

    const classRegex =
      /class\s+(\w+)(?:\s*extends\s+(\w+))?(?:\s*implements\s+([\w,\s]+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      const [, name, extendsClass, implementsClause] = match;
      types.push({
        name,
        kind: "class",
        extends: extendsClass ? [extendsClass] : undefined,
        implements: implementsClause
          ? implementsClause.split(",").map((s) => s.trim())
          : undefined,
      });
    }

    return types;
  }

  private extractProperties(body: string): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    const propertyRegex = /(readonly\s+)?(\w+)(\?)?\s*:\s*([^;\n,]+)/g;
    let match;

    while ((match = propertyRegex.exec(body)) !== null) {
      const [, readonly, name, optional, type] = match;
      properties.push({
        name,
        type: type.trim(),
        optional: !!optional,
        readonly: !!readonly,
      });
    }

    return properties;
  }

  private extractGenerics(content: string): string[] {
    const generics: string[] = [];
    const genericRegex = /<([^>]+)>/g;
    let match;

    while ((match = genericRegex.exec(content)) !== null) {
      const genericParams = match[1].split(",").map((s) => s.trim());
      generics.push(...genericParams);
    }

    return [...new Set(generics)];
  }

  private detectAsync(content: string, language: string): boolean {
    if (language !== "typescript" && language !== "javascript") return false;
    return (
      content.includes("async") ||
      content.includes("await") ||
      content.includes("Promise")
    );
  }

  private extractReturnType(content: string): string | undefined {
    const returnTypeRegex = /function\s+\w+[^:]*:\s*([^\{\;\n]+)/;
    const arrowReturnTypeRegex = /\)\s*:\s*([^=>\{\n]+)\s*=>/;

    let match =
      content.match(returnTypeRegex) || content.match(arrowReturnTypeRegex);
    return match ? match[1].trim() : undefined;
  }

  private extractParameters(content: string): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const functionRegex =
      /function\s+\w+\s*\(([^)]*)\)|\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const paramString = match[1];
      if (paramString) {
        const paramRegex = /(\w+)(\?)?\s*:\s*([^,=]+)(?:\s*=\s*([^,]+))?/g;
        let paramMatch;

        while ((paramMatch = paramRegex.exec(paramString)) !== null) {
          const [, name, optional, type, defaultValue] = paramMatch;
          parameters.push({
            name,
            type: type.trim(),
            optional: !!optional,
            defaultValue: defaultValue?.trim(),
          });
        }
      }
    }

    return parameters;
  }
}
