import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CouncilConfig } from './types';

const DEFAULT_CONFIG: CouncilConfig = {
  projectDir: '.',
  meetingsDir: './meetings',
  agentsDir: '.claude/agents',
  port: 3000,
};

let cachedConfig: CouncilConfig | null = null;

export async function getConfig(): Promise<CouncilConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const configPath = path.join(process.cwd(), 'council.config.json');
    const raw = await readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(raw);
    cachedConfig = { ...DEFAULT_CONFIG, ...userConfig };
  } catch {
    cachedConfig = DEFAULT_CONFIG;
  }

  return cachedConfig!;
}

/** Clear the cached config so the next getConfig() re-reads from disk. */
export function clearConfigCache(): void {
  cachedConfig = null;
}

export function resolveDir(dir: string): string {
  if (path.isAbsolute(dir)) return dir;
  return path.join(process.cwd(), dir);
}
