import { readFileSync, existsSync } from "fs";
import { join } from "path";

export class IgnoreParser {
  private patterns: string[] = [];
  private compiled: RegExp[] = [];

  constructor(ignorePath?: string) {
    if (ignorePath && existsSync(ignorePath)) {
      this.loadIgnoreFile(ignorePath);
    }
  }

  static fromProject(rootPath: string): IgnoreParser {
    const vivadocIgnorePath = join(rootPath, ".vivadocignore");
    const gitIgnorePath = join(rootPath, ".gitignore");

    const parser = new IgnoreParser();

    if (existsSync(vivadocIgnorePath)) {
      parser.loadIgnoreFile(vivadocIgnorePath);
    }

    if (existsSync(gitIgnorePath)) {
      parser.loadIgnoreFile(gitIgnorePath);
    }

    parser.addDefaultPatterns();

    return parser;
  }

  private loadIgnoreFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

      this.patterns.push(...lines);
      this.compilePatterns();
    } catch (error) {
      console.warn(`Erro ao carregar arquivo ignore ${filePath}:`, error);
    }
  }

  private addDefaultPatterns(): void {
    const defaultPatterns = [
      // Directories
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "out/**",
      ".next/**",
      "coverage/**",
      ".nyc_output/**",
      "tmp/**",
      "temp/**",

      // Files
      "*.log",
      "*.tmp",
      "*.cache",
      ".DS_Store",
      "Thumbs.db",

      // Environment and secrets
      ".env*",
      "*.key",
      "*.pem",
      "*.p12",
      "*.pfx",
      "secrets/**",
      "private/**",

      // Build outputs
      "*.min.js",
      "*.min.css",
      "*.map",

      // IDE files
      ".vscode/settings.json",
      ".idea/**",
      "*.swp",
      "*.swo",
      "*~",

      // OS files
      ".DS_Store",
      "Thumbs.db",
      "desktop.ini",
    ];

    this.patterns.push(...defaultPatterns);
    this.compilePatterns();
  }

  private compilePatterns(): void {
    this.compiled = this.patterns.map((pattern) =>
      this.patternToRegex(pattern)
    );
  }

  private patternToRegex(pattern: string): RegExp {
    let regex = pattern
      .replace(/[.+^$(){}[\]|\\]/g, "\\$&")
      .replace(/\?/g, "[^/]")
      .replace(/\*\*/g, "__DOUBLESTAR__")
      .replace(/\*/g, "[^/]*")
      .replace(/__DOUBLESTAR__/g, ".*");

    if (pattern.endsWith("/")) {
      regex += ".*";
    }

    if (pattern.startsWith("/")) {
      regex = "^" + regex.substring(1);
    } else {
      regex = "(^|/)" + regex;
    }

    if (!pattern.includes("*") && !pattern.endsWith("/")) {
      regex += "($|/)";
    }

    try {
      return new RegExp(regex);
    } catch (error) {
      console.warn(`Erro ao compilar padrão ${pattern}:`, error);
      return new RegExp("(?!)");
    }
  }

  shouldIgnore(filePath: string): boolean {
    const normalizedPath = filePath
      .replace(/^\.\//, "")
      .replace(/\/+/g, "/")
      .replace(/\\/g, "/");

    return this.compiled.some((regex) => regex.test(normalizedPath));
  }

  addPattern(pattern: string): void {
    this.patterns.push(pattern);
    this.compilePatterns();
  }

  getPatterns(): string[] {
    return [...this.patterns];
  }

  containsSecrets(filePath: string, content?: string): boolean {
    const secretPatterns = [
      /api[_-]?key/i,
      /secret[_-]?key/i,
      /private[_-]?key/i,
      /access[_-]?token/i,
      /auth[_-]?token/i,
      /password/i,
      /passwd/i,
      /credential/i,
      /certificate/i,
      /BEGIN\s+(PRIVATE\s+KEY|CERTIFICATE)/i,
      /[a-zA-Z0-9]{32,}/,
    ];

    if (secretPatterns.some((pattern) => pattern.test(filePath))) {
      return true;
    }

    if (content) {
      const lines = content.split("\n").slice(0, 10);
      return lines.some((line) =>
        secretPatterns.some((pattern) => pattern.test(line))
      );
    }

    return false;
  }

  static createDefaultIgnoreFile(rootPath: string): string {
    const content = `# Vivadoc ignore file
# Patterns to exclude from indexing

# Dependencies
node_modules/
vendor/

# Build outputs
dist/
build/
out/
.next/
coverage/

# Logs
*.log
logs/

# Environment files
.env*
secrets/
private/

# IDE files
.vscode/settings.json
.idea/

# OS files
.DS_Store
Thumbs.db

# Temporary files
tmp/
temp/
*.tmp
*.cache

# Minified files
*.min.js
*.min.css
*.map

# Add your custom patterns below
`;

    const ignorePath = join(rootPath, ".vivadocignore");
    return content;
  }
}
