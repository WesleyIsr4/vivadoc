import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export interface Workspace {
  id: string;
  name: string;
  root: string;
  owner: string;
  members: string[];
  settings: WorkspaceSettings;
  createdAt: Date;
  lastIndexed?: Date;
}

export interface WorkspaceSettings {
  llmProvider: string;
  maxTokens: number;
  allowedDomains?: string[];
  restrictedPaths?: string[];
  retentionDays: number;
  requireApproval: boolean;
}

export class WorkspaceManager {
  private workspacesDir: string;
  private workspaces: Map<string, Workspace> = new Map();

  constructor(baseDir: string) {
    this.workspacesDir = join(baseDir, ".vivadoc", "workspaces");
    this.ensureWorkspacesDir();
    this.loadWorkspaces();
  }

  private ensureWorkspacesDir(): void {
    if (!existsSync(this.workspacesDir)) {
      mkdirSync(this.workspacesDir, { recursive: true });
    }
  }

  private loadWorkspaces(): void {
    const configFile = join(this.workspacesDir, "config.json");
    if (existsSync(configFile)) {
      try {
        const data = JSON.parse(readFileSync(configFile, "utf-8"));
        data.workspaces.forEach((ws: any) => {
          this.workspaces.set(ws.id, {
            ...ws,
            createdAt: new Date(ws.createdAt),
            lastIndexed: ws.lastIndexed ? new Date(ws.lastIndexed) : undefined,
          });
        });
      } catch (error) {
        console.warn("Failed to load workspaces config:", error);
      }
    }
  }

  private saveWorkspaces(): void {
    const configFile = join(this.workspacesDir, "config.json");
    const data = {
      version: "1.0",
      workspaces: Array.from(this.workspaces.values()),
    };
    writeFileSync(configFile, JSON.stringify(data, null, 2));
  }

  createWorkspace(
    name: string,
    root: string,
    owner: string,
    settings?: Partial<WorkspaceSettings>
  ): Workspace {
    const id = this.generateWorkspaceId();
    const workspace: Workspace = {
      id,
      name,
      root: resolve(root),
      owner,
      members: [owner],
      settings: {
        llmProvider: "auto",
        maxTokens: 2000,
        retentionDays: 30,
        requireApproval: false,
        ...settings,
      },
      createdAt: new Date(),
    };

    this.workspaces.set(id, workspace);
    this.saveWorkspaces();
    this.createWorkspaceDir(id);

    return workspace;
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  listWorkspaces(userId?: string): Workspace[] {
    const workspaces = Array.from(this.workspaces.values());
    if (userId) {
      return workspaces.filter(
        (ws) => ws.owner === userId || ws.members.includes(userId)
      );
    }
    return workspaces;
  }

  updateWorkspace(id: string, updates: Partial<Workspace>): boolean {
    const workspace = this.workspaces.get(id);
    if (!workspace) return false;

    const updated = { ...workspace, ...updates };
    this.workspaces.set(id, updated);
    this.saveWorkspaces();
    return true;
  }

  deleteWorkspace(id: string, userId: string): boolean {
    const workspace = this.workspaces.get(id);
    if (!workspace || workspace.owner !== userId) {
      return false;
    }

    this.workspaces.delete(id);
    this.saveWorkspaces();
    return true;
  }

  addMember(workspaceId: string, userId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace || workspace.members.includes(userId)) {
      return false;
    }

    workspace.members.push(userId);
    this.saveWorkspaces();
    return true;
  }

  removeMember(
    workspaceId: string,
    userId: string,
    requesterId: string
  ): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (
      !workspace ||
      workspace.owner !== requesterId ||
      userId === workspace.owner
    ) {
      return false;
    }

    workspace.members = workspace.members.filter((id) => id !== userId);
    this.saveWorkspaces();
    return true;
  }

  canAccess(workspaceId: string, userId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    return workspace.owner === userId || workspace.members.includes(userId);
  }

  getWorkspaceDataDir(workspaceId: string): string {
    return join(this.workspacesDir, workspaceId);
  }

  private createWorkspaceDir(id: string): void {
    const dir = this.getWorkspaceDataDir(id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private generateWorkspaceId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export class EnterpriseFeatures {
  static validateLicense(licenseKey: string): boolean {
    return licenseKey.startsWith("VD_ENTERPRISE_");
  }

  static getFeatureLimits(licenseType: "free" | "pro" | "enterprise") {
    const limits = {
      free: {
        maxWorkspaces: 1,
        maxMembers: 3,
        maxIndexSizeMB: 100,
        chatRateLimit: 100,
      },
      pro: {
        maxWorkspaces: 10,
        maxMembers: 25,
        maxIndexSizeMB: 1000,
        chatRateLimit: 1000,
      },
      enterprise: {
        maxWorkspaces: -1,
        maxMembers: -1,
        maxIndexSizeMB: -1,
        chatRateLimit: -1,
      },
    };

    return limits[licenseType];
  }

  static async auditLog(
    workspaceId: string,
    userId: string,
    action: string,
    details: any
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      workspaceId,
      userId,
      action,
      details: JSON.stringify(details),
    };

    console.log("AUDIT:", logEntry);
  }
}
