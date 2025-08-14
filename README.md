# Vivadoc

<div align="center">

![Vivadoc Logo](https://cdn.jsdelivr.net/npm/vivadoc@latest/public/logo.svg)

**AI-Powered Living Documentation for Your Codebase**

[![npm version](https://badge.fury.io/js/vivadoc.svg)](https://badge.fury.io/js/vivadoc)
[![Downloads](https://img.shields.io/npm/dm/vivadoc.svg)](https://www.npmjs.com/package/vivadoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

[🚀 Quick Start](#quick-start) • [📖 Documentation](https://github.com/vivadoc/vivadoc#readme) • [💬 Chat Demo](https://vivadoc.dev/demo) • [🐛 Report Bug](https://github.com/vivadoc/vivadoc/issues)

</div>

## Overview

Vivadoc transforms any codebase into interactive, AI-powered documentation. It automatically detects your project's stack, indexes your code semantically, and provides a chat interface where you can ask natural language questions about your codebase.

### ✨ Key Features

- 🎯 **Auto Stack Detection** - Supports React, Next.js, Vue, Svelte, Angular and more
- 🧠 **Semantic Code Analysis** - Advanced chunking with AST parsing and metadata extraction  
- 🔍 **Hybrid Search** - Combines BM25, vector search, and cross-encoder reranking
- 🤖 **Multi-LLM Support** - Works with OpenAI, Ollama (local), and mock providers
- 🔒 **Privacy First** - 100% local execution, your code never leaves your machine
- ⚡ **Fast Performance** - Incremental indexing and intelligent caching
- 📝 **Precise Citations** - Every answer includes exact file:line references

## Quick Start

### 1. Install

```bash
# Install globally
npm install -g vivadoc

# Or with your preferred package manager
yarn global add vivadoc
pnpm add -g vivadoc
```

### 2. Initialize

```bash
# Navigate to your project
cd your-awesome-project

# Auto-detect stack and create configuration
vivadoc init

# The CLI will detect your framework automatically:
✓ Detected React project with TypeScript
✓ Created vivadoc.config.json
✓ Generated .vivadocignore with security patterns
```

### 3. Index Your Code

```bash
# Index your entire codebase
vivadoc index

# Watch for changes during development
vivadoc index --watch

# Output:
✓ Analyzed 45 files
✓ Created 1,247 intelligent chunks  
✓ Built hybrid search index
✓ Ready for AI chat in 3.2s
```

### 4. Chat with Your Code

```bash
# Start the chat interface
vivadoc dev

# Opens http://localhost:3001
🚀 Vivadoc running at http://localhost:3001
💬 Chat with your codebase using natural language
```

### 5. Ask Questions

Now you can chat with your code:

**You:** "How does the useApi hook work?"  
**Vivadoc:** The `useApi` hook is a custom React hook that manages HTTP requests with loading states [src/hooks/useApi.ts:15-45]. It uses Axios and provides `data`, `loading`, `error` states...

**You:** "Where are the product routes defined?"  
**Vivadoc:** Product routes are defined in the App Router at [src/app/products/page.tsx:1-20] and API routes at [src/app/api/products/route.ts:5-30]...

## Example Conversations

### 🔍 Code Understanding
- "Explain the authentication system"
- "How does state management work here?"
- "Show me all the API endpoints"

### 🛠️ Implementation Help  
- "How to add a new React component?"
- "Where should I put utility functions?"
- "How to handle errors in this project?"

### 🏗️ Architecture Questions
- "What's the folder structure logic?"
- "How are routes organized?"
- "What testing patterns are used?"

## Supported Frameworks

| Framework | Detection | Indexing | Chat Quality |
|-----------|-----------|----------|-------------|
| **React** | ✅ Auto | ✅ Components, Hooks | 🌟 Excellent |
| **Next.js** | ✅ Auto | ✅ Pages, API Routes | 🌟 Excellent |  
| **Vue 3** | ✅ Auto | ✅ Components, Composables | 🌟 Excellent |
| **Svelte** | ✅ Auto | ✅ Components, Stores | ⭐ Great |
| **Angular** | ✅ Auto | ✅ Components, Services | ⭐ Great |
| **TypeScript** | ✅ Auto | ✅ Types, Interfaces | 🌟 Excellent |
| **JavaScript** | ✅ Auto | ✅ Functions, Classes | ⭐ Great |

## LLM Providers

Vivadoc supports multiple LLM providers with auto-detection:

### OpenAI (Recommended)
```bash
export OPENAI_API_KEY=your_key_here
# Vivadoc will auto-detect and use GPT-4o-mini
```

### Ollama (Local/Private)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2:3b

# Vivadoc will auto-detect Ollama
```

### Auto-Detection
Vivadoc automatically chooses the best available provider:
1. OpenAI (if API key is configured)
2. Ollama (if running locally)  
3. Mock (for development/testing)

## Configuration

### Project Config (`vivadoc.config.json`)

```json
{
  "name": "My Awesome Project",
  "stack": "react",
  "includePatterns": [
    "src/**/*",
    "components/**/*",
    "pages/**/*", 
    "*.md"
  ],
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    ".env*"
  ],
  "llm": {
    "provider": "auto",
    "model": "gpt-4o-mini",
    "temperature": 0.1
  }
}
```

### Environment Variables

```bash
# LLM Provider (optional - auto-detects)
VIVADOC_LLM_PROVIDER=auto

# OpenAI
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini

# Ollama  
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

## CLI Reference

### Commands

- `vivadoc init` - Initialize project with auto stack detection
- `vivadoc index` - Index codebase with semantic analysis
- `vivadoc dev` - Start development server with chat interface
- `vivadoc build` - Generate static documentation site
- `vivadoc providers` - List available LLM providers

### Options

```bash
# Global options
-r, --root <path>     Project root directory
-v, --verbose         Enable verbose logging
-h, --help           Display help information

# Init options  
--stack <framework>   Manually specify framework
--force              Overwrite existing config

# Index options
--watch              Watch for file changes
--force              Force complete reindexing

# Dev options
-p, --port <number>  Server port (default: 3001)
--open               Open browser automatically
```

## Programmatic API

### Basic Usage

```javascript
import { Vivadoc } from 'vivadoc';

// Initialize with auto-detection
const vivadoc = await Vivadoc.create({
  root: './my-project'
});

// Index the codebase
await vivadoc.index();

// Ask questions
const answer = await vivadoc.ask("How does authentication work?");
console.log(answer.content);
console.log(answer.citations); // [{ filePath: "...", startLine: 10 }]
```

### Advanced Usage

```javascript
import { Vivadoc, HybridSearch, LLMProviderFactory } from 'vivadoc';

// Custom configuration
const vivadoc = new Vivadoc({
  root: './project',
  stack: 'nextjs',
  llmProvider: 'openai',
  chunkSize: 1000,
  includePatterns: ['src/**/*', 'docs/**/*']
});

await vivadoc.init();
await vivadoc.index();

// Streaming responses
await vivadoc.askStream(
  "Explain the API architecture",
  (chunk) => process.stdout.write(chunk)
);

// Direct search without LLM
const results = await vivadoc.search("useEffect hooks", {
  limit: 10,
  filters: { type: 'function' }
});
```

## REST API

When running `vivadoc dev`, you get a REST API:

### Chat Endpoint

```bash
POST /api/chat
Content-Type: application/json

{
  "message": "How does the useApi hook work?",
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "message": {
    "id": "msg-123",
    "role": "assistant",
    "content": "The useApi hook is a custom React hook...",
    "citations": [
      {
        "filePath": "src/hooks/useApi.ts",
        "startLine": 10,
        "endLine": 30,
        "content": "export const useApi = (url) => { ... }"
      }
    ]
  },
  "sessionId": "session-456"
}
```

## Architecture

Vivadoc uses a sophisticated 5-stage pipeline:

1. **Stack Detection** - Auto-detect project type and configure adapters
2. **Intelligent Indexing** - Semantic chunking with AST analysis  
3. **Hybrid Search** - BM25 + Vector Search + Cross-encoder reranking
4. **AI Generation** - Multi-provider LLM with mandatory citations
5. **Smart Caching** - Multi-level caching for optimal performance

## Performance

Tested on real projects:

| Project Size | Indexing Time | Search Speed | Memory Usage |
|-------------|---------------|--------------|--------------|
| Small (< 50 files) | < 5s | < 200ms | ~ 10MB |
| Medium (< 500 files) | < 30s | < 500ms | ~ 50MB |
| Large (< 5000 files) | < 5min | < 1s | ~ 200MB |

## Privacy & Security

- **100% Local Processing** - Your code never leaves your machine
- **Automatic Secret Detection** - Filters out API keys and sensitive data
- **Configurable Ignores** - `.vivadocignore` file like `.gitignore`
- **No Telemetry** - Zero tracking or data collection

## Examples

### Real Project Examples

```bash
# React project with hooks
vivadoc init    # → Detects React + TypeScript
vivadoc index   # → Finds components, hooks, utils
# Ask: "How does useLocalStorage work?"

# Next.js project  
vivadoc init    # → Detects Next.js + App Router
vivadoc index   # → Finds pages, API routes, middleware
# Ask: "Show me the authentication flow"

# Vue 3 project
vivadoc init    # → Detects Vue 3 + Composition API  
vivadoc index   # → Finds components, composables, stores
# Ask: "How does the shopping cart work?"
```

## Troubleshooting

### Common Issues

**Q: "No LLM provider configured"**  
A: Set up OpenAI key or install Ollama. Run `vivadoc providers` to check status.

**Q: "Index not found"**  
A: Run `vivadoc index` to create the search index first.

**Q: "Poor search results"**  
A: Try `vivadoc index --force` to rebuild with latest improvements.

**Q: "Slow responses"**  
A: Local models (Ollama) are slower. Consider using OpenAI for faster responses.

### Getting Help

- 📖 [Full Documentation](https://github.com/vivadoc/vivadoc)
- 🐛 [Report Issues](https://github.com/vivadoc/vivadoc/issues)  
- 💬 [Discussions](https://github.com/vivadoc/vivadoc/discussions)
- 📧 [Email Support](mailto:support@vivadoc.dev)

## Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/vivadoc/vivadoc/blob/main/CONTRIBUTING.md).

```bash
git clone https://github.com/vivadoc/vivadoc.git
cd vivadoc
npm install
npm run build
npm test
```

## License

MIT © [Vivadoc Team](https://github.com/vivadoc)

## What's Next?

- 🔌 **VS Code Extension** - Native IDE integration
- 🌐 **GitHub App** - Repository integration
- 👥 **Team Workspaces** - Collaborative documentation
- 📊 **Analytics Dashboard** - Usage insights and metrics

---

<div align="center">

**[⭐ Star us on GitHub](https://github.com/vivadoc/vivadoc) if Vivadoc helps you document your code!**

Made with ❤️ for developers who love clean documentation

</div>