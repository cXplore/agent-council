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
  const isMinimalScan = profile.scanQuality?.quality === 'minimal';
  const isBasicScan = profile.scanQuality?.quality === 'basic';

  // For low-confidence scans, use hedged language instead of asserting wrong facts
  const highConfFrameworks = profile.frameworks.filter(f => f.confidence === 'high');
  const mediumConfFrameworks = profile.frameworks.filter(f => f.confidence === 'medium');
  let frameworkNames: string;
  if (highConfFrameworks.length > 0) {
    frameworkNames = highConfFrameworks.map(f => f.name).join(', ');
    if (mediumConfFrameworks.length > 0) {
      frameworkNames += ` (possibly also ${mediumConfFrameworks.map(f => f.name).join(', ')})`;
    }
  } else if (mediumConfFrameworks.length > 0) {
    frameworkNames = `possibly ${mediumConfFrameworks.map(f => f.name).join(', ')} (not confirmed)`;
  } else if (isMinimalScan) {
    frameworkNames = 'not yet identified — treat framework assumptions as uncertain';
  } else {
    // No standard framework detected — this is normal for many Python/Go/Rust projects
    frameworkNames = 'no standard framework detected';
  }

  let languageNames: string;
  if (profile.languages.length > 0) {
    languageNames = profile.languages.map(l => l.name).join(', ');
  } else if (isMinimalScan) {
    languageNames = 'not yet identified — avoid making language-specific recommendations until confirmed';
  } else {
    languageNames = 'Unknown';
  }

  const libs = profile.libraries;
  const libSections: string[] = [];
  for (const [category, names] of Object.entries(libs)) {
    if (names.length > 0) libSections.push(`${category}: ${names.join(', ')}`);
  }
  // Build coverage boundaries summary
  let coverageSummary = 'Not available';
  const cb = profile.coverageBoundaries;
  if (cb) {
    const lines: string[] = [];
    if (cb.knownDomains.length > 0) {
      lines.push('Agents CAN reason about: ' + cb.knownDomains.join('; '));
    }
    if (cb.unknownDomains.length > 0) {
      lines.push('Agents should HEDGE on: ' + cb.unknownDomains.join('; '));
    }
    lines.push(`Files scanned: ${cb.filesCovered} | Scanned dirs: ${cb.scannedPaths.join(', ') || 'none'} | Skipped dirs: ${cb.skippedPaths.join(', ') || 'none'}`);
    coverageSummary = lines.join('\n');
  }

  // Add scan confidence notice for agent context
  let scanConfidenceNotice = '';
  if (isMinimalScan) {
    scanConfidenceNotice = '\n\n> **Note:** The automatic scan of this project produced minimal results. '
      + 'Your understanding of the tech stack may be incomplete or incorrect. '
      + 'Ask clarifying questions rather than assuming specific technologies. '
      + 'Prefix uncertain claims with "based on limited scan data" or similar hedging.\n';
  } else if (isBasicScan) {
    scanConfidenceNotice = '\n\n> **Note:** The automatic scan detected some signals but may be missing details. '
      + 'Verify assumptions about the stack before making specific recommendations.\n';
  }

  return {
    PROJECT_NAME: projectName,
    FRAMEWORK: frameworkNames,
    LANGUAGES: languageNames,
    PACKAGE_MANAGER: profile.packageManager,
    MEETINGS_DIR: 'meetings',
    LIBRARIES: libSections.length > 0 ? libSections.join('\n') : 'None detected',
    ANIMATION_LIBS: (libs.animation ?? []).join(', ') || 'None installed',
    TESTING_LIBS: [...new Set([...(libs.testing ?? []), ...(profile.testInfo?.frameworks ?? [])])].join(', ') || 'None installed',
    DB_LIBS: (libs.database ?? []).join(', ') || 'None installed',
    UI_LIBS: (libs.ui ?? []).join(', ') || 'None installed',
    THREE_D_LIBS: (libs['3d'] ?? []).join(', ') || 'None installed',
    COVERAGE_BOUNDARIES: coverageSummary,
    SCAN_CONFIDENCE_NOTICE: scanConfidenceNotice,
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

  // Build confidence notice to append after Identity section
  const confidenceNotice = placeholders.SCAN_CONFIDENCE_NOTICE || '';

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
      let filled = fillTemplate(templateContent, placeholders);
      // Inject confidence notice after the first Identity section if scan quality is low
      if (confidenceNotice) {
        const identityIdx = filled.indexOf('## Identity');
        if (identityIdx !== -1) {
          // Find the next section boundary (---) after Identity
          const afterIdentity = filled.indexOf('\n---', identityIdx + 11);
          if (afterIdentity !== -1) {
            filled = filled.slice(0, afterIdentity) + '\n' + confidenceNotice + filled.slice(afterIdentity);
          } else {
            // Append at end if no section boundary found
            filled += '\n' + confidenceNotice;
          }
        } else {
          // No Identity section — append after frontmatter
          const fmEnd = filled.indexOf('---', 4);
          if (fmEnd !== -1) {
            const insertPos = filled.indexOf('\n', fmEnd) + 1;
            filled = filled.slice(0, insertPos) + confidenceNotice + '\n' + filled.slice(insertPos);
          }
        }
      }
      await writeFile(destPath, filled, 'utf-8');
      generated.push(filename);
    } catch {
      // Template doesn't exist or write failed — skip silently
    }
  }

  return { generated, skipped };
}
