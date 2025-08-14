# Vivadoc

<div align="center">

![Vivadoc Logo](https://vivadoc.dev/logo.svg)

**AI-Powered Living Documentation for Your Codebase**

[![npm version](https://badge.fury.io/js/@vivadoc/core.svg)](https://badge.fury.io/js/@vivadoc/core)
[![Build Status](https://github.com/vivadoc/vivadoc/workflows/CI/badge.svg)](https://github.com/vivadoc/vivadoc/actions)
[![Coverage Status](https://coveralls.io/repos/github/vivadoc/vivadoc/badge.svg?branch=main)](https://coveralls.io/github/vivadoc/vivadoc?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[🚀 Quick Start](#quick-start) • [📖 Documentation](https://docs.vivadoc.dev) • [💬 Community](https://discord.gg/vivadoc) • [🐛 Report Bug](https://github.com/vivadoc/vivadoc/issues)

</div>

## Overview

Vivadoc transforms any codebase into interactive, AI-powered documentation. It automatically detects your project's stack, indexes your code semantically, and provides a chat interface where you can ask natural language questions about your codebase.

### Key Features

- 🎯 **Auto Stack Detection** - Automatically detects React, Next.js, Vue, Svelte, Angular and more
- 🧠 **Semantic Code Analysis** - Advanced chunking with AST parsing and metadata extraction  
- 🔍 **Hybrid Search** - Combines BM25, vector search, and cross-encoder reranking
- 🤖 **Multi-LLM Support** - Works with OpenAI, Ollama (local), and mock providers
- 🔒 **Privacy First** - 100% local execution, your code never leaves your machine
- ⚡ **Fast Performance** - Incremental indexing and intelligent caching
- 📝 **Precise Citations** - Every answer includes exact file:line references

## Quick Start

```bash
# Install globally
npm install -g @vivadoc/core

# Initialize in your project
cd your-project
vivadoc init

# Index your codebase
vivadoc index

# Start the chat interface
vivadoc dev
```

Visit http://localhost:3001 to start chatting with your code!

## Example Conversations

**You:** "How does the useApi hook work?"
**Vivadoc:** The `useApi` hook is a custom React hook that manages HTTP requests with loading states [src/hooks/useApi.ts:15-45]. It uses Axios for requests and provides `data`, `loading`, `error` states...

**You:** "Where are the product routes defined?"  
**Vivadoc:** Product routes are defined in the App Router at [src/app/products/page.tsx:1-20] and [src/app/api/products/route.ts:5-30]...

## Supported Stacks

| Framework | Detection | Indexing | Chat |
|-----------|-----------|----------|------|
| React | ✅ | ✅ | ✅ |
| Next.js | ✅ | ✅ | ✅ |  
| Vue 3 | ✅ | ✅ | ✅ |
| Svelte | ✅ | ✅ | ✅ |
| Angular | ✅ | ✅ | ✅ |
| TypeScript | ✅ | ✅ | ✅ |
| JavaScript | ✅ | ✅ | ✅ |

## Configuration

Create a `vivadoc.config.json`:

```json
{
  "name": "My Project",
  "stack": "react",
  "includePatterns": ["src/**/*", "docs/**/*"],
  "ignorePatterns": ["node_modules/**", "dist/**"],
  "llm": {
    "provider": "auto",
    "model": "gpt-4o-mini",
    "temperature": 0.1
  }
}
```

## LLM Providers

### OpenAI (Recommended)
```bash
export OPENAI_API_KEY=your_key_here
export OPENAI_MODEL=gpt-4o-mini
```

### Ollama (Local/Private)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2:3b

# Configure
export VIVADOC_LLM_PROVIDER=ollama
export OLLAMA_MODEL=llama3.2:3b
```

## API Reference

### CLI Commands

- `vivadoc init` - Initialize project with auto stack detection
- `vivadoc index` - Index codebase with semantic analysis
- `vivadoc dev` - Start development server with hot reload
- `vivadoc build` - Generate static documentation
- `vivadoc providers` - List available LLM providers

### Programmatic Usage

```typescript
import { Vivadoc } from '@vivadoc/core';

const vivadoc = new Vivadoc({
  root: './my-project',
  llmProvider: 'openai'
});

await vivadoc.index();
const answer = await vivadoc.ask("How does authentication work?");
console.log(answer.content); // AI response with citations
```

## Architecture

Vivadoc uses a sophisticated 5-stage pipeline:

1. **Detection** - Auto-detect project stack and configuration
2. **Indexing** - Semantic chunking with AST analysis and metadata
3. **Search** - Hybrid retrieval (BM25 + Vector + Cross-encoder reranking)  
4. **Generation** - LLM response with mandatory citations
5. **Caching** - Multi-level caching for performance

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

### Development Setup

```bash
git clone https://github.com/vivadoc/vivadoc.git
cd vivadoc
npm install
npm run build
npm test
```

## License

MIT © [Vivadoc Team](https://vivadoc.dev)

## Support

- 📖 [Documentation](https://docs.vivadoc.dev)
- 💬 [Discord Community](https://discord.gg/vivadoc)
- 🐛 [Issue Tracker](https://github.com/vivadoc/vivadoc/issues)
- 📧 [Email Support](mailto:support@vivadoc.dev)

---

<div align="center">

**[⭐ Star us on GitHub](https://github.com/vivadoc/vivadoc) if Vivadoc helps you!**

Made with ❤️ by the [Vivadoc Team](https://vivadoc.dev/team)

</div>