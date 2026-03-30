import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fillTemplate } from '@/lib/agent-templates';
import type { ProjectProfile } from '@/lib/types';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'agents');
export const CORE_AGENTS = ['architect', 'critic', 'developer', 'north-star', 'project-manager'];

/** Append meetingsDir to .gitignore if not already present */
export async function ensureGitignore(projectPath: string, meetingsDir: string) {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const pattern = meetingsDir.endsWith('/') ? meetingsDir : meetingsDir + '/';
  try {
    await access(gitignorePath);
    const content = await readFile(gitignorePath, 'utf-8');
    // Check if already ignored (with or without trailing slash)
    const lines = content.split(/\r?\n/);
    const alreadyIgnored = lines.some(
      l => l.trim() === meetingsDir || l.trim() === pattern
    );
    if (!alreadyIgnored) {
      const separator = content.endsWith('\n') ? '' : '\n';
      await writeFile(gitignorePath, content + separator + pattern + '\n', 'utf-8');
    }
  } catch {
    // No .gitignore — don't create one (the project might not use git)
  }
}

/** Build placeholder map from ProjectProfile */
export function buildPlaceholders(projectPath: string, profile: ProjectProfile): Record<string, string> {
  const projectName = path.basename(projectPath);
  const frameworkNames = profile.frameworks.map(f => f.name).join(', ') || 'Unknown';
  const languageNames = profile.languages.map(l => l.name).join(', ') || 'Unknown';
  const libs = profile.libraries;
  const libSections: string[] = [];
  for (const [category, names] of Object.entries(libs)) {
    if (names.length > 0) libSections.push(`${category}: ${names.join(', ')}`);
  }
  return {
    PROJECT_NAME: projectName,
    FRAMEWORK: frameworkNames,
    LANGUAGES: languageNames,
    PACKAGE_MANAGER: profile.packageManager,
    MEETINGS_DIR: 'meetings',
    LIBRARIES: libSections.length > 0 ? libSections.join('\n') : 'None detected',
    ANIMATION_LIBS: (libs.animation ?? []).join(', ') || 'None installed',
    TESTING_LIBS: (libs.testing ?? []).join(', ') || 'None installed',
    DB_LIBS: (libs.database ?? []).join(', ') || 'None installed',
    UI_LIBS: (libs.ui ?? []).join(', ') || 'None installed',
    THREE_D_LIBS: (libs['3d'] ?? []).join(', ') || 'None installed',
  };
}

/** Generate core agents from templates into {projectPath}/.claude/agents/, skipping existing */
export async function generateCoreAgents(
  projectPath: string,
  agentsDir: string,
  profile: ProjectProfile
): Promise<{ generated: string[]; skipped: string[] }> {
  const absAgentsDir = path.join(projectPath, agentsDir);
  await mkdir(absAgentsDir, { recursive: true });

  const placeholders = buildPlaceholders(projectPath, profile);
  const generated: string[] = [];
  const skipped: string[] = [];

  for (const agentName of CORE_AGENTS) {
    const filename = `${agentName}.md`;
    const destPath = path.join(absAgentsDir, filename);

    // Skip if agent already exists
    try {
      await access(destPath);
      skipped.push(filename);
      continue;
    } catch {
      // File doesn't exist — generate it
    }

    try {
      const templateContent = await readFile(path.join(TEMPLATES_DIR, filename), 'utf-8');
      const filled = fillTemplate(templateContent, placeholders);
      await writeFile(destPath, filled, 'utf-8');
      generated.push(filename);
    } catch {
      // Template doesn't exist or write failed — skip silently
    }
  }

  return { generated, skipped };
}
