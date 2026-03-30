import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { CouncilConfig, ProjectConfig } from './types';

const DEFAULT_CONFIG: CouncilConfig = {
  projects: {},
  activeProject: 'workspace',
  workspace: {
    agentsDir: './agents',
    meetingsDir: './meetings',
  },
  port: 3003,
};

let cachedConfig: CouncilConfig | null = null;

function getConfigPath(): string {
  return path.join(process.cwd(), 'council.config.json');
}

/** Migrate old flat config to new multi-project format */
function migrateConfig(raw: Record<string, unknown>): CouncilConfig {
  // Old format: { projectDir, meetingsDir, agentsDir, port }
  if ('projectDir' in raw && !('projects' in raw)) {
    const projectDir = raw.projectDir as string;
    const meetingsDir = raw.meetingsDir as string;
    const agentsDir = raw.agentsDir as string;
    const port = (raw.port as number) ?? 3003;

    // If projectDir is "." it was workspace mode
    if (projectDir === '.' || projectDir === './') {
      return {
        projects: {},
        activeProject: 'workspace',
        workspace: {
          agentsDir: agentsDir || './agents',
          meetingsDir: meetingsDir || './meetings',
        },
        port,
      };
    }

    // Otherwise it was pointing at an external project
    const name = path.basename(projectDir);
    return {
      projects: {
        [name]: {
          path: projectDir,
          meetingsDir: meetingsDir || 'meetings',
          agentsDir: agentsDir || '.claude/agents',
        },
      },
      activeProject: name,
      workspace: {
        agentsDir: './agents',
        meetingsDir: './meetings',
      },
      port,
    };
  }

  // New format — deep merge workspace to prevent partial drops
  const merged = { ...DEFAULT_CONFIG, ...(raw as Partial<CouncilConfig>) };
  merged.workspace = { ...DEFAULT_CONFIG.workspace, ...(merged.workspace ?? {}) };
  return merged;
}

export async function getConfig(): Promise<CouncilConfig> {
  // Always read from disk in dev to avoid stale cache from module re-evaluation
  try {
    const raw = JSON.parse(await readFile(getConfigPath(), 'utf-8'));
    cachedConfig = migrateConfig(raw);
  } catch {
    if (!cachedConfig) {
      cachedConfig = { ...DEFAULT_CONFIG, projects: {} };
    }
  }

  return JSON.parse(JSON.stringify(cachedConfig!));
}

export async function saveConfig(config: CouncilConfig): Promise<void> {
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
  cachedConfig = JSON.parse(JSON.stringify(config));
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function resolveDir(dir: string): string {
  if (path.isAbsolute(dir)) return dir;
  return path.join(process.cwd(), dir);
}

export interface ActiveProjectResult {
  name: string;
  agentsDir: string;
  meetingsDir: string;
  projectPath?: string;
  /** True if the configured activeProject was not found and we fell back to workspace */
  fallback?: boolean;
}

/** Get the active project config, or workspace if "workspace" is active */
export function getActiveProjectConfig(config: CouncilConfig): ActiveProjectResult {
  if (config.activeProject === 'workspace') {
    return {
      name: 'workspace',
      agentsDir: resolveDir(config.workspace.agentsDir),
      meetingsDir: resolveDir(config.workspace.meetingsDir),
    };
  }

  const project = config.projects[config.activeProject];
  if (!project) {
    // Loud warning — this means config.activeProject points to a project that doesn't exist
    console.warn(
      `[council] Active project "${config.activeProject}" not found in config.projects — falling back to workspace. ` +
      `This usually means the project was removed from config without updating activeProject.`
    );
    return {
      name: 'workspace',
      agentsDir: resolveDir(config.workspace.agentsDir),
      meetingsDir: resolveDir(config.workspace.meetingsDir),
      fallback: true,
    };
  }

  return {
    name: config.activeProject,
    projectPath: project.path,
    agentsDir: resolveProjectDir(project, 'agentsDir'),
    meetingsDir: resolveProjectDir(project, 'meetingsDir'),
  };
}

/** Resolve a project-relative directory to an absolute path */
function resolveProjectDir(project: ProjectConfig, key: 'agentsDir' | 'meetingsDir'): string {
  const dir = project[key];
  if (path.isAbsolute(dir)) return dir;
  return path.join(project.path, dir);
}

/** Validate that connected projects still exist on disk */
export async function validateProjects(config: CouncilConfig): Promise<{ valid: string[]; missing: string[] }> {
  const valid: string[] = [];
  const missing: string[] = [];

  for (const [name, project] of Object.entries(config.projects)) {
    try {
      await stat(project.path);
      valid.push(name);
    } catch {
      missing.push(name);
    }
  }

  return { valid, missing };
}

/** Get config for a specific project by name */
export function getProjectConfig(config: CouncilConfig, name: string): { agentsDir: string; meetingsDir: string; projectPath?: string } | null {
  if (name === 'workspace') {
    return {
      agentsDir: resolveDir(config.workspace.agentsDir),
      meetingsDir: resolveDir(config.workspace.meetingsDir),
    };
  }

  const project = config.projects[name];
  if (!project) return null;

  return {
    projectPath: project.path,
    agentsDir: resolveProjectDir(project, 'agentsDir'),
    meetingsDir: resolveProjectDir(project, 'meetingsDir'),
  };
}
