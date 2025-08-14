import { ProjectStack } from "../types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export class StackDetector {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async detectStack(): Promise<ProjectStack> {
    try {
      const packageJsonPath = join(this.rootPath, "package.json");
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (dependencies.next || dependencies["@next/next"]) {
          return this.detectNextJsVersion();
        }

        if (dependencies.react && dependencies["react-dom"]) {
          return this.detectReactStack();
        }

        if (dependencies.vue) {
          return this.detectVueStack();
        }

        if (dependencies.svelte) {
          return "svelte";
        }

        if (dependencies["@angular/core"]) {
          return "angular";
        }

        if (this.hasTypeScriptConfig()) {
          if (this.isNodeProject(dependencies)) {
            return "node";
          }
          return "typescript";
        }

        if (this.isNodeProject(dependencies)) {
          return "node";
        }
      }

      if (this.hasNextJsConfig()) return "nextjs";
      if (this.hasViteConfig()) return "react";
      if (this.hasVueConfig()) return "vue";
      if (this.hasSvelteConfig()) return "svelte";
      if (this.hasAngularConfig()) return "angular";
      if (this.hasTypeScriptConfig()) return "typescript";
      if (this.hasNodeIndicators()) return "node";

      return "unknown";
    } catch (error) {
      console.warn("Erro ao detectar stack:", error);
      return "unknown";
    }
  }

  private detectNextJsVersion(): ProjectStack {
    if (existsSync(join(this.rootPath, "app"))) {
      return "nextjs";
    }
    if (existsSync(join(this.rootPath, "pages"))) {
      return "nextjs";
    }
    return "nextjs";
  }

  private detectReactStack(): ProjectStack {
    if (
      existsSync(join(this.rootPath, "vite.config.ts")) ||
      existsSync(join(this.rootPath, "vite.config.js"))
    ) {
      return "react";
    }
    if (existsSync(join(this.rootPath, "craco.config.js"))) {
      return "react";
    }
    if (existsSync(join(this.rootPath, "webpack.config.js"))) {
      return "react";
    }
    return "react";
  }

  private detectVueStack(): ProjectStack {
    if (
      existsSync(join(this.rootPath, "vite.config.ts")) ||
      existsSync(join(this.rootPath, "vite.config.js"))
    ) {
      return "vue";
    }
    if (existsSync(join(this.rootPath, "vue.config.js"))) {
      return "vue";
    }
    return "vue";
  }

  private hasNextJsConfig(): boolean {
    return (
      existsSync(join(this.rootPath, "next.config.js")) ||
      existsSync(join(this.rootPath, "next.config.ts")) ||
      existsSync(join(this.rootPath, "next.config.mjs"))
    );
  }

  private hasViteConfig(): boolean {
    return (
      existsSync(join(this.rootPath, "vite.config.js")) ||
      existsSync(join(this.rootPath, "vite.config.ts")) ||
      existsSync(join(this.rootPath, "vite.config.mjs"))
    );
  }

  private hasVueConfig(): boolean {
    return (
      existsSync(join(this.rootPath, "vue.config.js")) ||
      existsSync(join(this.rootPath, "vue.config.ts"))
    );
  }

  private hasSvelteConfig(): boolean {
    return (
      existsSync(join(this.rootPath, "svelte.config.js")) ||
      existsSync(join(this.rootPath, "svelte.config.ts"))
    );
  }

  private hasAngularConfig(): boolean {
    return existsSync(join(this.rootPath, "angular.json"));
  }

  private hasTypeScriptConfig(): boolean {
    return (
      existsSync(join(this.rootPath, "tsconfig.json")) ||
      existsSync(join(this.rootPath, "tsconfig.base.json")) ||
      existsSync(join(this.rootPath, "typescript.json"))
    );
  }

  private hasNodeIndicators(): boolean {
    return (
      existsSync(join(this.rootPath, "package.json")) ||
      existsSync(join(this.rootPath, "yarn.lock")) ||
      existsSync(join(this.rootPath, "package-lock.json")) ||
      existsSync(join(this.rootPath, "pnpm-lock.yaml"))
    );
  }

  private isNodeProject(dependencies: Record<string, any>): boolean {
    const nodeIndicators = [
      "express",
      "fastify",
      "koa",
      "hapi",
      "@nestjs/core",
      "@types/node",
      "nodemon",
      "ts-node",
      "@typescript-eslint/parser",
      "commander",
      "yargs",
      "inquirer",
      "chalk",
      "ora",
    ];

    return nodeIndicators.some(
      (indicator) =>
        dependencies[indicator] ||
        (dependencies.devDependencies &&
          dependencies.devDependencies[indicator])
    );
  }

  detectTypeScriptFeatures(): {
    hasTypes: boolean;
    hasInterfaces: boolean;
    hasEnums: boolean;
    hasNamespaces: boolean;
  } {
    const features = {
      hasTypes: false,
      hasInterfaces: false,
      hasEnums: false,
      hasNamespaces: false,
    };

    try {
      // Buscar por arquivos .ts/.tsx no src/
      const srcPath = join(this.rootPath, "src");
      if (existsSync(srcPath)) {
        // Implementar busca por padrões TypeScript
        // Esta é uma implementação básica - poderia ser expandida
        features.hasTypes = true;
        features.hasInterfaces = true;
      }
    } catch (error) {
      console.warn("Erro ao detectar features TypeScript:", error);
    }

    return features;
  }

  async detectMonorepo(): Promise<boolean> {
    try {
      const packageJsonPath = join(this.rootPath, "package.json");
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

        if (packageJson.workspaces || packageJson.pnpm?.workspaces) {
          return true;
        }

        if (existsSync(join(this.rootPath, "lerna.json"))) {
          return true;
        }

        if (existsSync(join(this.rootPath, "nx.json"))) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }
}
