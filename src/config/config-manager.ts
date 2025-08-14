import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import type { VivadocConfig } from '../types';

export class ConfigManager {
  private root: string;
  private configPath: string;

  constructor(root: string) {
    this.root = root;
    this.configPath = join(root, 'vivadoc.config.json');
  }

  async loadConfig(): Promise<VivadocConfig> {
    try {
      const configData = readFileSync(this.configPath, 'utf-8');
      return JSON.parse(configData) as VivadocConfig;
    } catch (error) {
      throw new Error(`Failed to load config: ${(error as Error).message}`);
    }
  }

  async saveConfig(config: VivadocConfig): Promise<void> {
    try {
      const configData = JSON.stringify(config, null, 2);
      writeFileSync(this.configPath, configData);
    } catch (error) {
      throw new Error(`Failed to save config: ${(error as Error).message}`);
    }
  }
}