import { ChatSession, ChatMessage } from "../types";

export class ChatSessionManager {
  private sessions: Map<string, ChatSession> = new Map();
  private maxSessions = 100;
  private sessionTimeout = 24 * 60 * 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  createSession(projectName?: string): ChatSession {
    const sessionId = this.generateSessionId();

    const session: ChatSession = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      context: {
        activeProject: projectName,
      },
    };

    this.sessions.set(sessionId, session);
    this.ensureSessionLimit();

    return session;
  }

  getSession(sessionId: string): ChatSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (this.isSessionExpired(session)) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  addMessage(sessionId: string, message: ChatMessage): boolean {
    const session = this.getSession(sessionId);

    if (!session) {
      return false;
    }

    session.messages.push(message);
    session.updatedAt = new Date();

    if (session.messages.length > 50) {
      session.messages = session.messages.slice(-40);
    }

    return true;
  }

  getRecentMessages(sessionId: string, limit = 10): ChatMessage[] {
    const session = this.getSession(sessionId);

    if (!session) {
      return [];
    }

    return session.messages.slice(-limit);
  }

  updateSessionContext(
    sessionId: string,
    context: Partial<ChatSession["context"]>
  ): boolean {
    const session = this.getSession(sessionId);

    if (!session) {
      return false;
    }

    session.context = {
      ...session.context,
      ...context,
    };

    session.updatedAt = new Date();
    return true;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  getActiveSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .filter((session) => !this.isSessionExpired(session))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getSessionStats() {
    const activeSessions = this.getActiveSessions();

    return {
      totalSessions: activeSessions.length,
      totalMessages: activeSessions.reduce(
        (sum, s) => sum + s.messages.length,
        0
      ),
      averageMessagesPerSession:
        activeSessions.length > 0
          ? Math.round(
              activeSessions.reduce((sum, s) => sum + s.messages.length, 0) /
                activeSessions.length
            )
          : 0,
      oldestSession:
        activeSessions.length > 0
          ? Math.min(...activeSessions.map((s) => s.createdAt.getTime()))
          : null,
    };
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isSessionExpired(session: ChatSession): boolean {
    const now = Date.now();
    const lastActivity = session.updatedAt.getTime();
    return now - lastActivity > this.sessionTimeout;
  }

  private cleanupExpiredSessions(): void {
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach((sessionId) => {
      this.sessions.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
      console.log(
        `Limpeza automática: ${expiredSessions.length} sessões expiradas removidas`
      );
    }
  }

  private ensureSessionLimit(): void {
    if (this.sessions.size <= this.maxSessions) {
      return;
    }

    const sessions = Array.from(this.sessions.entries()).sort(
      ([, a], [, b]) => a.updatedAt.getTime() - b.updatedAt.getTime()
    );

    const toRemove = sessions.slice(0, sessions.length - this.maxSessions);

    toRemove.forEach(([sessionId]) => {
      this.sessions.delete(sessionId);
    });

    console.log(
      `Limite de sessões atingido: ${toRemove.length} sessões antigas removidas`
    );
  }
}
