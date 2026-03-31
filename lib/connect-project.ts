/**
 * Unified project connection logic.
 * Both /api/setup/connect and /api/projects (action='add') delegate here.
 * This ensures every connect path produces identical directory structure and config entries.
 */
import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, saveConfig } from './config';
import { scanProject } from './scanner';
import { ensureGitignore, generateCoreAgents } from './project-setup';
import { generateSkeletonContext, generateProjectBrief, PROJECT_BRIEF_FILENAME } from './context-files';
import type { ProjectProfile } from './types';

export interface ConnectOptions {
  /** Absolute path to the project directory */
  projectPath: string;
  /** Optional override for meetings directory (relative to project) */
  meetingsDir?: string;
  /** Optional override for agents directory (relative to project) */
  agentsDir?: string;
  /** Optional project name (defaults to directory basename) */
  name?: string;
  /** Optional pre-computed profile (skips scanning if provided) */
  profile?: ProjectProfile;
}

export interface ConnectResult {
  success: true;
  name: string;
  project: { path: string; meetingsDir: string; agentsDir: string; profile?: ProjectProfile };
  agentCount: number;
  hasFacilitator: boolean;
  profile?: ProjectProfile;
  generatedAgents: string[];
  contextFilesWritten: number;
  briefCreated: boolean;
  scanWarning?: string;
}

const MEETINGS_DIR_CANDIDATES = ['docs/10-meetings', 'docs/meetings', 'meetings', '.meetings'];

/**
 * Connect a project to Agent Council.
 * Performs all setup steps in a consistent order:
 * 1. Validate and normalize path
 * 2. Auto-detect meetings dir
 * 3. Count existing agents
 * 4. Create directories (meetings + agents)
 * 5. Scan project (if no profile provided)
 * 6. Ensure .gitignore covers meetings dir
 * 7. Auto-generate core agents (if none exist and profile available)
 * 8. Write skeleton context files
 * 9. Write project brief template
 * 10. Save to config and set as active
 */
export async function connectProject(opts: ConnectOptions): Promise<ConnectResult> {
  // 1. Normalize path
  const normalizedPath = path.resolve(opts.projectPath.replace(/\//g, path.sep));

  // Verify directory exists
  const s = await stat(normalizedPath);
  if (!s.isDirectory()) {
    throw new Error('Path exists but is not a directory');
  }

  // Derive project name
  const projectName = opts.name || path.basename(normalizedPath);

  // Validate name
  if (!/^[\w.-]{1,100}$/.test(projectName)) {
    throw new Error('Project name must be alphanumeric (hyphens, underscores, dots allowed), max 100 chars');
  }

  // 2. Auto-detect meetings dir
  let resolvedMeetingsDir = opts.meetingsDir || 'meetings';
  if (!opts.meetingsDir) {
    for (const candidate of MEETINGS_DIR_CANDIDATES) {
      try {
        await stat(path.join(normalizedPath, candidate));
        resolvedMeetingsDir = candidate;
        break;
      } catch {
        // try next
      }
    }
  }

  // Validate meetings dir is inside project
  const absMeetingsDir = path.isAbsolute(resolvedMeetingsDir)
    ? resolvedMeetingsDir
    : path.join(normalizedPath, resolvedMeetingsDir);
  const normalizedMeetings = path.resolve(absMeetingsDir);
  if (!normalizedMeetings.startsWith(normalizedPath + path.sep) && normalizedMeetings !== normalizedPath) {
    throw new Error('meetingsDir must be inside the project directory');
  }

  // 3. Agents dir + count
  const resolvedAgentsDir = opts.agentsDir || '.claude/agents';
  let agentCount = 0;
  let hasFacilitator = false;
  try {
    const agentFiles = await readdir(path.join(normalizedPath, resolvedAgentsDir));
    const mdFiles = agentFiles.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
    agentCount = mdFiles.length;
    hasFacilitator = mdFiles.includes('facilitator.md');
  } catch {
    // no agents dir yet
  }

  // 4. Create directories
  const absAgentsDir = path.join(normalizedPath, resolvedAgentsDir);
  await Promise.all([
    mkdir(absMeetingsDir, { recursive: true }),
    mkdir(absAgentsDir, { recursive: true }),
  ]);

  // 5. Scan project (if no profile provided)
  let profile = opts.profile;
  let scanWarning: string | undefined;
  if (!profile) {
    try {
      profile = await scanProject(normalizedPath);
      if (profile.truncated) {
        scanWarning = 'Large repository — scan was capped at 50,000 files. Agent context may be incomplete.';
      } else if (profile.scanQuality?.quality === 'minimal') {
        scanWarning = 'Could not detect enough project structure. Agents will use generic prompts.';
      }
    } catch (scanErr) {
      scanWarning = `Scan failed: ${scanErr instanceof Error ? scanErr.message : 'unknown error'}. Connected without project profile.`;
    }
  }

  // 6. Ensure .gitignore covers meetings dir
  try {
    await ensureGitignore(normalizedPath, resolvedMeetingsDir);
  } catch {
    // Non-fatal
  }

  // 7. Auto-generate core agents if none exist
  let generatedAgents: string[] = [];
  if (profile && agentCount === 0) {
    try {
      const result = await generateCoreAgents(normalizedPath, resolvedAgentsDir, profile);
      generatedAgents = result.generated;
      agentCount = result.generated.length + result.skipped.length;
      hasFacilitator = false; // Core agents don't include facilitator
    } catch {
      // Non-fatal
    }
  }

  // 8. Write skeleton context files
  let contextFilesWritten = 0;
  if (profile?.suggestedAgents) {
    const contextPromises = profile.suggestedAgents.map(async (agent) => {
      const contextPath = path.join(absAgentsDir, `${agent}.context.md`);
      try {
        await stat(contextPath);
        // Already exists — don't overwrite
      } catch {
        await writeFile(contextPath, generateSkeletonContext(agent, profile!), 'utf-8');
        contextFilesWritten++;
      }
    });
    await Promise.all(contextPromises);
  }

  // 9. Write project brief template
  let briefCreated = false;
  const briefPath = path.join(absMeetingsDir, PROJECT_BRIEF_FILENAME);
  try {
    await stat(briefPath);
    // Already exists — don't overwrite
  } catch {
    await writeFile(briefPath, generateProjectBrief(projectName, profile || undefined), 'utf-8');
    briefCreated = true;
  }

  // 10. Save to config and set as active
  const config = await getConfig();
  const projectEntry = {
    path: normalizedPath.replace(/\\/g, '/'),
    meetingsDir: resolvedMeetingsDir,
    agentsDir: resolvedAgentsDir,
    ...(profile ? { profile } : {}),
  };
  config.projects[projectName] = projectEntry;
  config.activeProject = projectName;
  await saveConfig(config);

  return {
    success: true,
    name: projectName,
    project: projectEntry,
    agentCount,
    hasFacilitator,
    profile,
    generatedAgents,
    contextFilesWritten,
    briefCreated,
    ...(scanWarning ? { scanWarning } : {}),
  };
}
