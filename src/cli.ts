#!/usr/bin/env node

import { Command } from "commander";
import { StackDetector } from "./detectors/stack-detector";
import { FileIndexer } from "./indexers/file-indexer";
import { HybridSearch } from "./search/hybrid-search";
import { ProjectConfig, ChatRequest, ChatResponse } from "./types";
import { readFileSync, writeFileSync, existsSync, mkdirSync, watch } from "fs";
import { join, resolve } from "path";
import { glob } from "glob";
import chalk from "chalk";
import ora from "ora";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { LLMProviderFactory } from "./llm/provider-factory";
import { ResponseGenerator } from "./chat/response-generator";
import { ChatSessionManager } from "./chat/session-manager";
import { ChatMessage } from "./types";
import { IgnoreParser } from "./utils/ignore-parser";

function generateSuggestions(
  userMessage: string,
  _assistantMessage: ChatMessage
): string[] {
  const suggestions: string[] = [];

  if (userMessage.toLowerCase().includes("função")) {
    suggestions.push(
      "Como usar esta função?",
      "Onde esta função é chamada?",
      "Qual o retorno desta função?"
    );
  } else if (userMessage.toLowerCase().includes("component")) {
    suggestions.push(
      "Quais props este componente aceita?",
      "Como importar este componente?",
      "Exemplos de uso?"
    );
  } else if (userMessage.toLowerCase().includes("erro")) {
    suggestions.push(
      "Como corrigir este erro?",
      "Onde mais esse erro pode ocorrer?",
      "Documentação relacionada?"
    );
  } else {
    suggestions.push(
      "Explique mais detalhes",
      "Mostre exemplos de uso",
      "Arquivos relacionados"
    );
  }

  return suggestions.slice(0, 3);
}

const program = new Command();

program
  .name("vivadoc")
  .description("Documentação viva com chatbot de IA para repositórios")
  .version("0.1.0");

program
  .command("init")
  .description("Inicializar projeto Vivadoc")
  .option("-r, --root <path>", "Caminho raiz do projeto", ".")
  .action(async (options) => {
    const spinner = ora("Inicializando Vivadoc...").start();

    try {
      const rootPath = resolve(options.root);
      const detector = new StackDetector(rootPath);

      spinner.text = "Detectando stack do projeto...";
      const stack = await detector.detectStack();
      const isMonorepo = await detector.detectMonorepo();

      const config: ProjectConfig = {
        name: "Projeto Vivadoc",
        root: rootPath,
        stack,
        ignorePatterns: [
          "node_modules/**",
          "dist/**",
          ".next/**",
          "build/**",
          "out/**",
          "coverage/**",
          ".git/**",
          "*.log",
          ".env*",
        ],
        includePatterns: [
          "src/**/*",
          "components/**/*",
          "pages/**/*",
          "app/**/*",
          "lib/**/*",
          "utils/**/*",
          "types/**/*",
          "interfaces/**/*",
          "models/**/*",
          "@types/**/*",
          "*.md",
          "*.mdx",
          "*.d.ts",
        ],
        maxFileSize: 1024 * 1024,
        chunkSize: 1000,
        chunkOverlap: 200,
      };

      const configPath = join(rootPath, "vivadoc.config.json");
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const ignorePath = join(rootPath, ".vivadocignore");
      if (!existsSync(ignorePath)) {
        const ignoreContent = IgnoreParser.createDefaultIgnoreFile(rootPath);
        writeFileSync(ignorePath, ignoreContent);
        console.log(
          chalk.blue(`Arquivo .vivadocignore criado em: ${ignorePath}`)
        );
      }

      spinner.succeed(`Projeto inicializado com sucesso!`);
      console.log(chalk.green(`\nStack detectado: ${chalk.bold(stack)}`));
      if (isMonorepo) {
        console.log(chalk.yellow("Monorepo detectado"));
      }
      console.log(chalk.blue(`\nConfiguração salva em: ${configPath}`));
      console.log(chalk.gray("\nPróximos passos:"));
      console.log(
        chalk.gray("1. Ajuste o arquivo vivadoc.config.json se necessário")
      );
      console.log(chalk.gray("2. Execute: vivadoc index"));
      console.log(chalk.gray("3. Execute: vivadoc dev"));
    } catch (error) {
      spinner.fail("Erro ao inicializar projeto");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

program
  .command("index")
  .description("Indexar repositório")
  .option("-r, --root <path>", "Caminho raiz do projeto", ".")
  .option("-w, --watch", "Modo watch para reindexação automática")
  .action(async (options) => {
    const spinner = ora("Indexando repositório...").start();

    try {
      const rootPath = resolve(options.root);
      const configPath = join(rootPath, "vivadoc.config.json");

      if (!existsSync(configPath)) {
        spinner.fail(
          "Arquivo vivadoc.config.json não encontrado. Execute vivadoc init primeiro."
        );
        process.exit(1);
      }

      const config: ProjectConfig = JSON.parse(
        readFileSync(configPath, "utf-8")
      );
      const indexer = new FileIndexer(
        config.chunkSize,
        config.chunkOverlap,
        config.maxFileSize
      );
      const cacheDir = join(rootPath, ".vivadoc", "cache");
      const search = new HybridSearch(true, cacheDir);

      const ignoreParser = IgnoreParser.fromProject(rootPath);

      spinner.text = "Encontrando arquivos...";
      const files = await glob(config.includePatterns, {
        cwd: rootPath,
        ignore: config.ignorePatterns,
        absolute: true,
      });

      const fileStats = await Promise.all(
        files.map(async (file) => {
          try {
            const fs = await import("fs");
            const stats = fs.statSync(file);
            return { file, isFile: stats.isFile() };
          } catch {
            return { file, isFile: false };
          }
        })
      );

      const actualFiles = fileStats
        .filter((item) => item.isFile)
        .map((item) => item.file)
        .filter((file) => {
          const relativePath = file.replace(rootPath + "/", "");

          if (ignoreParser.shouldIgnore(relativePath)) {
            return false;
          }

          if (ignoreParser.containsSecrets(relativePath)) {
            console.warn(
              chalk.yellow(
                `Arquivo ignorado (possível segredo): ${relativePath}`
              )
            );
            return false;
          }

          return true;
        });

      spinner.text = `Indexando ${actualFiles.length} arquivos...`;
      let totalChunks = 0;

      for (let i = 0; i < actualFiles.length; i++) {
        const file = actualFiles[i];

        const progress = Math.round((i / actualFiles.length) * 100);
        spinner.text = `Indexando... ${progress}% (${i}/${actualFiles.length} arquivos, ${totalChunks} chunks)`;

        try {
          const chunks = await indexer.indexFile(file);

          const hasSecrets = chunks.some((chunk) =>
            ignoreParser.containsSecrets(chunk.filePath, chunk.content)
          );

          if (hasSecrets) {
            const relativePath = file.replace(rootPath + "/", "");
            console.warn(
              chalk.yellow(
                `Arquivo ignorado (contém possíveis segredos): ${relativePath}`
              )
            );
          } else {
            search.addChunks(chunks);
            totalChunks += chunks.length;
          }
        } catch (error) {
          console.warn(chalk.yellow(`Erro ao indexar ${file}:`, error));
        }

        await new Promise((resolve) => setImmediate(resolve));
      }

      await search.rebuildIndexes((status) => {
        spinner.text = status;
      });

      const stats = search.getStats();
      const searchData = search.exportData();

      const indexPath = join(rootPath, ".vivadoc", "index.json");
      mkdirSync(join(rootPath, ".vivadoc"), { recursive: true });
      writeFileSync(
        indexPath,
        JSON.stringify(
          {
            config,
            stats,
            searchData,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );

      spinner.succeed(`Indexação concluída!`);
      console.log(chalk.green(`\nTotal de arquivos: ${actualFiles.length}`));
      console.log(chalk.green(`Total de chunks: ${totalChunks}`));
      console.log(chalk.blue(`\nÍndice salvo em: ${indexPath}`));

      if (options.watch) {
        console.log(
          chalk.yellow("\nModo watch ativado. Pressione Ctrl+C para parar.")
        );

        const watchedPaths = new Set<string>();
        let reindexTimeout: NodeJS.Timeout;

        const reindexFiles = async (changedFiles: string[]) => {
          console.log(
            chalk.blue(
              `\nReindexando ${changedFiles.length} arquivo(s) alterado(s)...`
            )
          );

          const indexer = new FileIndexer(
            config.chunkSize,
            config.chunkOverlap,
            config.maxFileSize
          );

          let totalNewChunks = 0;
          for (const file of changedFiles) {
            try {
              const chunks = await indexer.indexFile(file);
              search.addChunks(chunks);
              totalNewChunks += chunks.length;
            } catch (error) {
              console.warn(chalk.yellow(`Erro ao reindexar ${file}:`, error));
            }
          }

          await search.rebuildIndexes();

          const newStats = search.getStats();
          const newSearchData = search.exportData();
          writeFileSync(
            indexPath,
            JSON.stringify(
              {
                config,
                stats: newStats,
                searchData: newSearchData,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            )
          );

          console.log(
            chalk.green(`Reindexação concluída! +${totalNewChunks} chunks`)
          );
        };

        const debouncedReindex = (file: string) => {
          watchedPaths.add(file);
          clearTimeout(reindexTimeout);
          reindexTimeout = setTimeout(async () => {
            const filesToReindex = Array.from(watchedPaths);
            watchedPaths.clear();
            await reindexFiles(filesToReindex);
          }, 1000);
        };

        const watchConfig = {
          recursive: true,
          persistent: true,
        };

        try {
          const watcher = watch(
            rootPath,
            watchConfig,
            (eventType, filename) => {
              if (!filename) return;

              const fullPath = join(rootPath, filename);

              const shouldWatch = config.includePatterns.some((pattern) => {
                return fullPath.includes(
                  pattern.replace("**/*", "").replace("*", "")
                );
              });

              const shouldIgnore = config.ignorePatterns.some((pattern) => {
                return fullPath.includes(
                  pattern.replace("**", "").replace("*", "")
                );
              });

              if (
                shouldWatch &&
                !shouldIgnore &&
                (eventType === "change" || eventType === "rename")
              ) {
                console.log(chalk.gray(`Detectada mudança: ${filename}`));
                debouncedReindex(fullPath);
              }
            }
          );

          process.on("SIGINT", () => {
            console.log(chalk.yellow("\nParando watcher..."));
            watcher.close();
            process.exit(0);
          });
        } catch (error) {
          console.warn(chalk.yellow("Erro ao configurar watcher:", error));
        }
      }
    } catch (error) {
      spinner.fail("Erro ao indexar repositório");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

program
  .command("dev")
  .description("Iniciar servidor de desenvolvimento")
  .option("-p, --port <number>", "Porta do servidor", "3001")
  .option("-r, --root <path>", "Caminho raiz do projeto", ".")
  .action(async (options) => {
    const spinner = ora("Iniciando servidor de desenvolvimento...").start();

    try {
      const rootPath = resolve(options.root);
      const indexPath = join(rootPath, ".vivadoc", "index.json");

      if (!existsSync(indexPath)) {
        spinner.fail("Índice não encontrado. Execute vivadoc index primeiro.");
        process.exit(1);
      }

      const app = express();
      const port = parseInt(options.port);

      app.use(cors());
      app.use(helmet());
      app.use(express.json());

      const indexData = JSON.parse(readFileSync(indexPath, "utf-8"));
      const cacheDir = join(rootPath, ".vivadoc", "cache");
      const search = new HybridSearch(true, cacheDir);

      if (indexData.searchData?.chunks) {
        spinner.text = "Carregando índice de busca...";
        await search.loadData(indexData.searchData);
        spinner.text = "Iniciando chat engine...";
      }

      spinner.text = "Inicializando LLM provider...";
      const llmProvider = await LLMProviderFactory.createDefault();
      const responseGenerator = new ResponseGenerator(search, llmProvider);
      const sessionManager = new ChatSessionManager();

      app.post("/api/chat", async (req, res) => {
        try {
          const {
            message,
            sessionId,
            stream = false,
          }: ChatRequest & { stream?: boolean } = req.body;

          if (!message?.trim()) {
            return res.status(400).json({ error: "Mensagem é obrigatória" });
          }

          let session = sessionId ? sessionManager.getSession(sessionId) : null;
          if (!session) {
            session = sessionManager.createSession(indexData.config.name);
          }

          const userMessage = {
            id: `msg-${Date.now()}-user`,
            role: "user" as const,
            content: message,
            timestamp: new Date(),
          };

          sessionManager.addMessage(session.id, userMessage);

          if (stream) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Content-Type",
            });

            const sendSSE = (data: any) => {
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
              sendSSE({
                type: "start",
                sessionId: session.id,
                messageId: `msg-${Date.now()}-assistant`,
              });

              const recentMessages = sessionManager.getRecentMessages(
                session.id,
                5
              );
              const streamingMessage =
                await responseGenerator.generateStreamingResponse(
                  message,
                  undefined,
                  recentMessages,
                  (chunk: string) => {
                    sendSSE({
                      type: "content",
                      content: chunk,
                    });
                  }
                );

              sessionManager.addMessage(session.id, streamingMessage);

              sendSSE({
                type: "complete",
                message: streamingMessage,
                suggestions: generateSuggestions(message, streamingMessage),
              });

              res.write("data: [DONE]\n\n");
              res.end();
            } catch (error) {
              sendSSE({
                type: "error",
                error: "Erro ao gerar resposta em streaming",
              });
              res.end();
            }
          } else {
            const recentMessages = sessionManager.getRecentMessages(
              session.id,
              5
            );
            const assistantMessage = await responseGenerator.generateResponse(
              message,
              undefined,
              recentMessages
            );

            sessionManager.addMessage(session.id, assistantMessage);

            const response: ChatResponse = {
              message: assistantMessage,
              sessionId: session.id,
              suggestions: generateSuggestions(message, assistantMessage),
              relatedChunks: [],
            };

            res.json(response);
          }
        } catch (error) {
          console.error("Erro no chat:", error);
          res.status(500).json({ error: "Erro interno do servidor" });
        }
      });

      app.get("/api/chat/:sessionId", (req, res) => {
        try {
          const { sessionId } = req.params;
          const session = sessionManager.getSession(sessionId);

          if (!session) {
            return res.status(404).json({ error: "Sessão não encontrada" });
          }

          res.json({
            session,
            messages: session.messages,
          });
        } catch (error) {
          res.status(500).json({ error: "Erro ao buscar sessão" });
        }
      });

      app.post("/api/chat/session", (_req, res) => {
        try {
          const session = sessionManager.createSession(indexData.config.name);
          res.json({ sessionId: session.id, session });
        } catch (error) {
          res.status(500).json({ error: "Erro ao criar sessão" });
        }
      });

      app.delete("/api/chat/:sessionId", (req, res) => {
        try {
          const { sessionId } = req.params;
          const deleted = sessionManager.deleteSession(sessionId);

          if (!deleted) {
            return res.status(404).json({ error: "Sessão não encontrada" });
          }

          res.json({ success: true });
        } catch (error) {
          res.status(500).json({ error: "Erro ao deletar sessão" });
        }
      });

      app.use(express.static(join(__dirname, "../public")));

      app.get("*", (_req, res) => {
        res.sendFile(join(__dirname, "../public/index.html"));
      });

      app.listen(port, () => {
        spinner.succeed(`Servidor rodando em http://localhost:${port}`);
        console.log(chalk.blue(`\nInterface web: http://localhost:${port}`));
        console.log(chalk.blue(`API: http://localhost:${port}/api`));
        console.log(chalk.gray("\nPressione Ctrl+C para parar"));
      });
    } catch (error) {
      spinner.fail("Erro ao iniciar servidor");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

program
  .command("build")
  .description("Gerar build estático da documentação")
  .option("-r, --root <path>", "Caminho raiz do projeto", ".")
  .option("-o, --output <path>", "Diretório de saída", "dist")
  .action(async (options) => {
    const spinner = ora("Gerando build estático...").start();

    try {
      const rootPath = resolve(options.root);
      const outputPath = join(rootPath, options.output);

      spinner.text = "Verificando dependências...";
      const indexPath = join(rootPath, ".vivadoc", "index.json");

      if (!existsSync(indexPath)) {
        spinner.fail("Índice não encontrado. Execute vivadoc index primeiro.");
        process.exit(1);
      }

      spinner.text = "Carregando dados do índice...";
      const indexData = JSON.parse(readFileSync(indexPath, "utf-8"));

      mkdirSync(outputPath, { recursive: true });

      spinner.text = "Gerando API estática...";
      const apiDir = join(outputPath, "api");
      mkdirSync(apiDir, { recursive: true });

      writeFileSync(
        join(apiDir, "search-data.json"),
        JSON.stringify(indexData.searchData, null, 2)
      );

      writeFileSync(
        join(apiDir, "config.json"),
        JSON.stringify(indexData.config, null, 2)
      );

      writeFileSync(
        join(apiDir, "stats.json"),
        JSON.stringify(indexData.stats, null, 2)
      );

      spinner.text = "Gerando página HTML...";
      const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vivadoc - ${indexData.config.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #000;
            color: #fff;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: hidden;
        }
        
        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            max-width: 100%;
            height: 100vh;
        }
        
        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            line-height: 1.4;
        }
        
        .message.user {
            background: #007acc;
            color: white;
            align-self: flex-end;
            margin-left: auto;
        }
        
        .message.assistant {
            background: #1a1a1a;
            border: 1px solid #333;
            align-self: flex-start;
        }
        
        .message-time {
            font-size: 11px;
            color: #888;
            margin-top: 4px;
            opacity: 0.7;
        }
        
        .typing {
            color: #888;
            font-style: italic;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }
        
        .chat-input-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #000;
            padding: 20px;
            display: flex;
            justify-content: center;
        }
        
        .chat-input-wrapper {
            display: flex;
            width: 100%;
            max-width: 700px;
            gap: 12px;
            align-items: center;
        }
        
        .chat-input {
            flex: 1;
            padding: 14px 20px;
            border: 1px solid #333;
            border-radius: 25px;
            background: #111;
            color: #fff;
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s ease;
        }
        
        .chat-input:focus {
            border-color: #007acc;
        }
        
        .chat-input::placeholder {
            color: #666;
        }
        
        .chat-send {
            padding: 14px 24px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: background 0.3s ease;
            min-width: 80px;
        }
        
        .chat-send:hover {
            background: #005a99;
        }
        
        .chat-send:active {
            transform: scale(0.98);
        }
        
        /* Customizar scrollbar */
        .chat-messages::-webkit-scrollbar {
            width: 6px;
        }
        
        .chat-messages::-webkit-scrollbar-track {
            background: transparent;
        }
        
        .chat-messages::-webkit-scrollbar-thumb {
            background: #333;
            border-radius: 3px;
        }
        
        .chat-messages::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
        
        .welcome-message {
            text-align: center;
            color: #888;
            font-size: 14px;
            margin-bottom: 20px;
            opacity: 0.8;
        }
        
        .citations {
            margin-top: 8px;
            font-size: 12px;
            color: #007acc;
        }
        
        .citation {
            color: #007acc;
            text-decoration: underline;
            margin-right: 8px;
            cursor: pointer;
        }
        
        .citation:hover {
            color: #0099ff;
        }
        
        @media (max-width: 768px) {
            .chat-input-container {
                padding: 15px;
            }
            
            .message {
                max-width: 90%;
            }
            
            .chat-input-wrapper {
                max-width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-messages" id="chatMessages">
            <div class="welcome-message">
                💬 Vivadoc - ${indexData.config.name}<br>
                Faça perguntas sobre o código
            </div>
        </div>
    </div>
    
    <div class="chat-input-container">
        <div class="chat-input-wrapper">
            <input 
                type="text" 
                class="chat-input" 
                id="chatInput" 
                placeholder="Digite sua pergunta sobre o código..."
                onkeypress="handleChatKeyPress(event)"
                autocomplete="off"
            >
            <button class="chat-send" onclick="sendMessage()">Enviar</button>
        </div>
    </div>
    
    <script>
        let currentSessionId = null;
        
        // Focar no input ao carregar a página
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('chatInput').focus();
        });
        
        // Chat functionality
        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            // Limpar input
            input.value = '';
            
            // Adicionar mensagem do usuário
            addMessage('user', message);
            
            // Mostrar typing indicator
            const typingId = addMessage('assistant', '', true);
            
            try {
                const response = await fetch('./api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        sessionId: currentSessionId
                    })
                });
                
                const data = await response.json();
                
                // Remover typing indicator
                const typingElement = document.getElementById(typingId);
                if (typingElement) {
                    typingElement.remove();
                }
                
                if (response.ok) {
                    currentSessionId = data.sessionId;
                    addMessage('assistant', data.message.content, false, data.message.citations);
                } else {
                    addMessage('assistant', 'Erro: ' + (data.error || 'Erro desconhecido'));
                }
                
            } catch (error) {
                const typingElement = document.getElementById(typingId);
                if (typingElement) {
                    typingElement.remove();
                }
                addMessage('assistant', 'Erro de conexão. Verifique se o servidor está rodando.');
            }
        }
        
        function addMessage(role, content, isTyping = false, citations = []) {
            const messagesDiv = document.getElementById('chatMessages');
            const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            
            // Remover mensagem de boas-vindas se existir
            const welcomeMsg = messagesDiv.querySelector('.welcome-message');
            if (welcomeMsg && !isTyping && role === 'user') {
                welcomeMsg.remove();
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;
            messageDiv.id = messageId;
            
            if (isTyping) {
                messageDiv.innerHTML = '<div class="typing">●●● Pensando...</div>';
            } else {
                let citationsHtml = '';
                if (citations && citations.length > 0) {
                    citationsHtml = '<div class="citations">📎 ' + 
                        citations.map(c => \`<span class="citation">\${c.filePath}:\${c.startLine}-\${c.endLine}</span>\`).join(' ') +
                        '</div>';
                }
                
                messageDiv.innerHTML = \`
                    <div>\${content.replace(/\\n/g, '<br>')}</div>
                    \${citationsHtml}
                    <div class="message-time">\${new Date().toLocaleTimeString()}</div>
                \`;
            }
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            
            return messageId;
        }
        
        function handleChatKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }
        
        // Detectar se está rodando estaticamente
        if (window.location.protocol === 'file:') {
            // Versão estática - mostrar mensagem
            setTimeout(() => {
                addMessage('assistant', 'Esta é a versão estática do Vivadoc. Para funcionalidades completas de chat, execute "vivadoc dev" no terminal.');
            }, 1000);
        }
    </script>
</body>
</html>`;

      writeFileSync(join(outputPath, "index.html"), htmlContent);

      // Gerar manifest
      spinner.text = "Gerando manifest...";
      const manifest = {
        name: "Vivadoc",
        version: "1.0.0",
        description: `Documentação viva para ${indexData.config.name}`,
        generated: new Date().toISOString(),
        totalChunks: indexData.stats.totalChunks,
        languages: indexData.stats.languages,
      };

      writeFileSync(
        join(outputPath, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      spinner.succeed("Build estático gerado com sucesso!");
      console.log(chalk.green(`\nArquivos salvos em: ${outputPath}`));
      console.log(
        chalk.blue(`Abra ${join(outputPath, "index.html")} no navegador`)
      );
    } catch (error) {
      spinner.fail("Erro ao gerar build");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

program
  .command("providers")
  .description("Listar providers de LLM disponíveis")
  .action(async () => {
    const spinner = ora("Verificando providers disponíveis...").start();

    try {
      const providers = await LLMProviderFactory.getAvailableProviders();

      spinner.stop();

      console.log(chalk.blue("\n📋 Providers de LLM Disponíveis:\n"));

      // OpenAI
      const openaiStatus = providers.openai.available
        ? chalk.green("✅ Disponível")
        : chalk.red("❌ Não configurado");
      console.log(`🤖 OpenAI: ${openaiStatus}`);
      if (!providers.openai.configured) {
        console.log(chalk.gray("   Configure: OPENAI_API_KEY=your_key"));
      }

      // Ollama
      const ollamaStatus = providers.ollama.available
        ? chalk.green(
            `✅ Disponível (${providers.ollama.models.length} modelos)`
          )
        : chalk.red("❌ Não disponível");
      console.log(`🦙 Ollama: ${ollamaStatus}`);
      if (providers.ollama.available && providers.ollama.models.length > 0) {
        console.log(
          chalk.gray(`   Modelos: ${providers.ollama.models.join(", ")}`)
        );
      } else {
        console.log(chalk.gray("   Inicie: ollama serve"));
      }

      // Mock
      console.log(`🎭 Mock: ${chalk.green("✅ Sempre disponível")}`);
      console.log(chalk.gray("   Usado como fallback para desenvolvimento"));

      console.log(chalk.blue("\n🔧 Configuração:"));
      console.log(chalk.gray("Variáveis de ambiente suportadas:"));
      console.log(
        chalk.gray("  VIVADOC_LLM_PROVIDER=(auto|openai|ollama|mock)")
      );
      console.log(chalk.gray("  OPENAI_API_KEY=your_key"));
      console.log(chalk.gray("  OPENAI_MODEL=gpt-4o-mini"));
      console.log(chalk.gray("  OLLAMA_BASE_URL=http://localhost:11434"));
      console.log(chalk.gray("  OLLAMA_MODEL=llama3.2:3b"));
    } catch (error) {
      spinner.fail("Erro ao verificar providers");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

program.parse();
