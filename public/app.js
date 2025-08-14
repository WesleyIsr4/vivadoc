// Modern Vivadoc Web Interface
class VivadocApp {
  constructor() {
    this.sessionId = null;
    this.isLoading = false;
    this.messageHistory = [];
    this.themes = {
      light: {
        bg: '#ffffff',
        surface: '#f8fafc',
        primary: '#667eea',
        text: '#1e293b',
        border: '#e2e8f0'
      },
      dark: {
        bg: '#0f172a',
        surface: '#1e293b', 
        primary: '#818cf8',
        text: '#f1f5f9',
        border: '#334155'
      }
    };
    
    this.currentTheme = localStorage.getItem('vivadoc-theme') || 'light';
    this.initializeApp();
  }

  initializeApp() {
    this.setupEventListeners();
    this.applyTheme();
    this.loadWelcomeMessage();
    this.focusInput();
    this.setupKeyboardShortcuts();
    this.loadSessionFromStorage();
  }

  setupEventListeners() {
    const sendBtn = document.getElementById('sendButton');
    const input = document.getElementById('chatInput');
    const themeToggle = document.getElementById('themeToggle');
    const clearBtn = document.getElementById('clearChat');
    const exportBtn = document.getElementById('exportChat');

    sendBtn?.addEventListener('click', () => this.sendMessage());
    input?.addEventListener('keypress', (e) => this.handleKeyPress(e));
    themeToggle?.addEventListener('click', () => this.toggleTheme());
    clearBtn?.addEventListener('click', () => this.clearChat());
    exportBtn?.addEventListener('click', () => this.exportChat());

    // Auto-resize textarea
    input?.addEventListener('input', () => this.autoResizeTextarea(input));
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K to focus input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('chatInput')?.focus();
      }
      
      // Cmd/Ctrl + L to clear chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        this.clearChat();
      }

      // Cmd/Ctrl + D to toggle theme
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        this.toggleTheme();
      }
    });
  }

  handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message || this.isLoading) return;

    // Clear input and add user message
    input.value = '';
    this.autoResizeTextarea(input);
    this.addMessage('user', message);
    
    // Show typing indicator
    const typingId = this.showTypingIndicator();
    this.setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          sessionId: this.sessionId
        }),
      });

      const data = await response.json();
      this.hideTypingIndicator(typingId);

      if (response.ok) {
        this.sessionId = data.sessionId;
        this.addMessage('assistant', data.message.content, data.message.citations);
        this.showSuggestions(data.suggestions);
        this.saveSessionToStorage();
      } else {
        this.addMessage('error', data.error || 'Erro na comunicação');
      }
    } catch (error) {
      console.error('Chat error:', error);
      this.hideTypingIndicator(typingId);
      this.addMessage('error', 'Erro de conexão. Verifique se o servidor está rodando.');
    } finally {
      this.setLoading(false);
      input.focus();
    }
  }

  addMessage(type, content, citations = null) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove welcome message on first interaction
    if (type === 'user') {
      const welcome = messagesContainer.querySelector('.welcome-message');
      welcome?.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.setAttribute('data-type', type);
    
    const timestamp = new Date().toLocaleTimeString();
    
    let citationsHtml = '';
    if (citations && citations.length > 0) {
      citationsHtml = `
        <div class="citations">
          <div class="citations-header">
            <span class="citations-icon">📎</span>
            <span class="citations-label">Fontes:</span>
          </div>
          <div class="citations-list">
            ${citations.map(citation => `
              <div class="citation" onclick="app.openCitation('${citation.filePath}', ${citation.startLine})">
                <span class="citation-file">${this.formatFilePath(citation.filePath)}</span>
                <span class="citation-lines">${citation.startLine}-${citation.endLine}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    messageDiv.innerHTML = `
      <div class="message-avatar">
        ${type === 'user' ? '👤' : type === 'assistant' ? '🤖' : '⚠️'}
      </div>
      <div class="message-content">
        <div class="message-text">${this.formatMessageContent(content)}</div>
        ${citationsHtml}
        <div class="message-time">${timestamp}</div>
      </div>
      <div class="message-actions">
        <button class="action-btn copy-btn" onclick="app.copyMessage(this)" title="Copiar mensagem">
          📋
        </button>
        ${type === 'assistant' ? `
          <button class="action-btn feedback-btn positive" onclick="app.sendFeedback(this, 'positive')" title="Útil">
            👍
          </button>
          <button class="action-btn feedback-btn negative" onclick="app.sendFeedback(this, 'negative')" title="Não útil">  
            👎
          </button>
        ` : ''}
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
    
    // Store in history
    this.messageHistory.push({
      type,
      content,
      citations,
      timestamp: new Date()
    });
  }

  formatMessageContent(content) {
    // Convert markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\\n/g, '<br>')
      .replace(/\\[([^\\]]+)\\]/g, '<span class="inline-citation">[$1]</span>');
  }

  formatFilePath(filePath) {
    const parts = filePath.split('/');
    if (parts.length > 3) {
      return `.../${parts.slice(-2).join('/')}`;
    }
    return filePath;
  }

  showTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    const typingId = `typing-${Date.now()}`;
    
    typingDiv.id = typingId;
    typingDiv.className = 'message message-assistant typing-indicator';
    typingDiv.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-animation">
          <div class="typing-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
          <span class="typing-text">IA está pensando...</span>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    this.scrollToBottom();
    
    return typingId;
  }

  hideTypingIndicator(typingId) {
    const typingElement = document.getElementById(typingId);
    typingElement?.remove();
  }

  showSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) return;

    const suggestionsContainer = document.getElementById('suggestions');
    if (!suggestionsContainer) return;

    suggestionsContainer.innerHTML = suggestions.map(suggestion => `
      <button class="suggestion-chip" onclick="app.sendSuggestion('${suggestion.replace(/'/g, "\\'")}')">
        ${suggestion}
      </button>
    `).join('');
    
    suggestionsContainer.style.display = 'flex';
    setTimeout(() => {
      suggestionsContainer.style.display = 'none';
    }, 10000); // Hide after 10s
  }

  sendSuggestion(text) {
    document.getElementById('chatInput').value = text;
    this.sendMessage();
  }

  // Theme management
  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('vivadoc-theme', this.currentTheme);
    this.applyTheme();
  }

  applyTheme() {
    const theme = this.themes[this.currentTheme];
    const root = document.documentElement;
    
    root.style.setProperty('--bg-color', theme.bg);
    root.style.setProperty('--surface-color', theme.surface);
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--text-color', theme.text);
    root.style.setProperty('--border-color', theme.border);
    
    document.body.setAttribute('data-theme', this.currentTheme);
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.textContent = this.currentTheme === 'light' ? '🌙' : '☀️';
      themeToggle.title = `Alternar para tema ${this.currentTheme === 'light' ? 'escuro' : 'claro'}`;
    }
  }

  // Utility methods
  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  scrollToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
  }

  setLoading(loading) {
    this.isLoading = loading;
    const sendBtn = document.getElementById('sendButton');
    const input = document.getElementById('chatInput');
    
    if (sendBtn) {
      sendBtn.disabled = loading;
      sendBtn.textContent = loading ? 'Enviando...' : 'Enviar';
    }
    
    if (input) {
      input.disabled = loading;
    }
  }

  focusInput() {
    setTimeout(() => {
      document.getElementById('chatInput')?.focus();
    }, 100);
  }

  // Session management
  saveSessionToStorage() {
    if (this.sessionId) {
      localStorage.setItem('vivadoc-session', this.sessionId);
      localStorage.setItem('vivadoc-history', JSON.stringify(this.messageHistory.slice(-50))); // Keep last 50
    }
  }

  loadSessionFromStorage() {
    const savedSession = localStorage.getItem('vivadoc-session');
    const savedHistory = localStorage.getItem('vivadoc-history');
    
    if (savedSession) {
      this.sessionId = savedSession;
    }
    
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        history.forEach(msg => {
          this.addMessage(msg.type, msg.content, msg.citations);
        });
      } catch (error) {
        console.warn('Failed to load chat history:', error);
      }
    }
  }

  // Action handlers
  clearChat() {
    if (confirm('Limpar todo o histórico do chat?')) {
      document.getElementById('chatMessages').innerHTML = '';
      this.messageHistory = [];
      this.sessionId = null;
      localStorage.removeItem('vivadoc-session');
      localStorage.removeItem('vivadoc-history');
      this.loadWelcomeMessage();
    }
  }

  copyMessage(button) {
    const messageText = button.closest('.message').querySelector('.message-text').textContent;
    navigator.clipboard.writeText(messageText).then(() => {
      button.textContent = '✅';
      setTimeout(() => button.textContent = '📋', 2000);
    });
  }

  async sendFeedback(button, rating) {
    // Visual feedback
    button.classList.add('selected');
    button.style.opacity = '0.5';
    
    try {
      // Send feedback to server (implement endpoint)
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: 'temp', // TODO: Add message IDs
          rating: rating,
          sessionId: this.sessionId
        })
      });
    } catch (error) {
      console.warn('Failed to send feedback:', error);
    }
  }

  openCitation(filePath, line) {
    // Try to open in VS Code
    const vscodeUrl = `vscode://file/${filePath}:${line}`;
    window.open(vscodeUrl, '_blank');
    
    // Fallback: show file preview modal
    setTimeout(() => {
      this.showFilePreview(filePath, line);
    }, 1000);
  }

  showFilePreview(filePath, line) {
    // TODO: Implement file preview modal
    alert(`Abrir arquivo: ${filePath}:${line}`);
  }

  exportChat() {
    const data = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      messages: this.messageHistory
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vivadoc-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadWelcomeMessage() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer.children.length === 0) {
      messagesContainer.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-header">
            <h3>🤖 Bem-vindo ao Vivadoc!</h3>
            <p>Faça perguntas sobre seu código em linguagem natural</p>
          </div>
          
          <div class="welcome-features">
            <div class="feature">
              <span class="feature-icon">🎯</span>
              <div>
                <strong>Busca Inteligente</strong>
                <p>Encontre funções, componentes e arquivos</p>
              </div>
            </div>
            <div class="feature">
              <span class="feature-icon">📎</span>
              <div>
                <strong>Citações Precisas</strong>
                <p>Cada resposta inclui referências exatas</p>
              </div>
            </div>
            <div class="feature">
              <span class="feature-icon">🔒</span>
              <div>
                <strong>100% Local</strong>
                <p>Seu código nunca sai da máquina</p>
              </div>
            </div>
          </div>
          
          <div class="welcome-examples">
            <div class="example-header">Experimente perguntar:</div>
            <div class="examples-grid">
              <button class="example-chip" onclick="app.sendSuggestion('Como funciona o sistema de roteamento?')">
                "Como funciona o sistema de roteamento?"
              </button>
              <button class="example-chip" onclick="app.sendSuggestion('Onde está definida a autenticação?')">
                "Onde está definida a autenticação?"
              </button>
              <button class="example-chip" onclick="app.sendSuggestion('Explique o hook useApi')">
                "Explique o hook useApi"
              </button>
              <button class="example-chip" onclick="app.sendSuggestion('Como implementar um novo componente?')">
                "Como implementar um novo componente?"
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }
}

// Global app instance
let app;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app = new VivadocApp();
});

// Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}