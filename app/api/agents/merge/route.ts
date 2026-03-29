import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { fillTemplate, parseFrontmatter, serializeFrontmatter } from '@/lib/agent-templates';
import { scanProject } from '@/lib/scanner';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'agents');

/**
 * GET /api/agents/merge — Preview what a merge would change.
 * Returns a diff-like view for each outdated agent showing
 * what frontmatter would be preserved and what body would change.
 */
export async function GET() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const agentsDir = active.agentsDir;
    const projectPath = active.projectPath ?? process.cwd();

    // Load project profile for placeholder values
    const profile = await scanProject(projectPath);
    const placeholders = buildPlaceholders(projectPath, profile);

    // List template files
    let templateFiles: string[];
    try {
      const entries = await readdir(TEMPLATES_DIR);
      templateFiles = entries.filter(f => f.endsWith('.md'));
    } catch {
      return NextResponse.json({ error: 'Templates directory not found' }, { status: 500 });
    }

    // List project agent files
    let agentFiles: string[];
    try {
      const entries = await readdir(agentsDir);
      agentFiles = entries.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
    } catch {
      return NextResponse.json({ agents: [], error: 'Agents directory not found' });
    }

    const previews = [];

    for (const filename of agentFiles) {
      if (!templateFiles.includes(filename)) continue;

      const agentContent = await readFile(path.join(agentsDir, filename), 'utf-8');
      const templateRaw = await readFile(path.join(TEMPLATES_DIR, filename), 'utf-8');

      const { frontmatter: agentFm, body: agentBody } = parseFrontmatter(agentContent);
      const filledTemplate = fillTemplate(templateRaw, placeholders);
      const { frontmatter: templateFm, body: templateBody } = parseFrontmatter(filledTemplate);

      // Check if body content differs (ignoring whitespace)
      const agentNorm = agentBody.trim().replace(/\s+/g, ' ');
      const templateNorm = templateBody.trim().replace(/\s+/g, ' ');
      const bodyChanged = agentNorm !== templateNorm;

      if (!bodyChanged) continue;

      // Build preview of what would be preserved vs replaced
      const preservedFrontmatter: Record<string, string | string[]> = {};
      const addedFrontmatter: Record<string, string | string[]> = {};

      // Keep all agent frontmatter values (model, team, etc.)
      for (const [key, value] of Object.entries(agentFm)) {
        preservedFrontmatter[key] = value;
      }

      // Add any new frontmatter keys from template that agent doesn't have
      for (const [key, value] of Object.entries(templateFm)) {
        if (!(key in agentFm)) {
          addedFrontmatter[key] = value;
        }
      }

      previews.push({
        filename,
        name: (agentFm['name'] as string) ?? filename.replace('.md', ''),
        bodyChanged,
        preservedFrontmatter,
        addedFrontmatter,
        currentBodyPreview: agentBody.trim().slice(0, 200),
        newBodyPreview: templateBody.trim().slice(0, 200),
        currentBodyLines: agentBody.trim().split('\n').length,
        newBodyLines: templateBody.trim().split('\n').length,
      });
    }

    return NextResponse.json({
      agents: previews,
      project: active.name,
      totalOutdated: previews.length,
    });
  } catch (err) {
    console.error('Merge preview error:', err);
    return NextResponse.json({ error: 'Failed to preview merge' }, { status: 500 });
  }
}

/**
 * POST /api/agents/merge — Apply the merge for specified agents.
 * Body: { agents: string[] } — filenames to merge (e.g., ["developer.md", "architect.md"])
 * If agents is empty or omitted, merges all outdated agents.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { agents?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // Empty or missing body is valid — means "merge all"
    }
    const requestedAgents: string[] | undefined = body.agents;

    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const agentsDir = active.agentsDir;
    const projectPath = active.projectPath ?? process.cwd();

    // Load project profile for placeholder values
    const profile = await scanProject(projectPath);
    const placeholders = buildPlaceholders(projectPath, profile);

    // List template files
    let templateFiles: string[];
    try {
      const entries = await readdir(TEMPLATES_DIR);
      templateFiles = entries.filter(f => f.endsWith('.md'));
    } catch {
      return NextResponse.json({ error: 'Templates directory not found' }, { status: 500 });
    }

    // List project agent files
    let agentFiles: string[];
    try {
      const entries = await readdir(agentsDir);
      agentFiles = entries.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
    } catch {
      return NextResponse.json({ error: 'Agents directory not found' }, { status: 500 });
    }

    const merged: string[] = [];
    const skipped: { filename: string; reason: string }[] = [];

    for (const filename of agentFiles) {
      // Skip if not in requested list (when specified)
      if (requestedAgents && requestedAgents.length > 0 && !requestedAgents.includes(filename)) continue;
      // Skip if no matching template
      if (!templateFiles.includes(filename)) {
        if (requestedAgents?.includes(filename)) {
          skipped.push({ filename, reason: 'No matching template' });
        }
        continue;
      }

      try {
        const agentPath = path.join(agentsDir, filename);
        const agentContent = await readFile(agentPath, 'utf-8');
        const templateRaw = await readFile(path.join(TEMPLATES_DIR, filename), 'utf-8');

        const { frontmatter: agentFm } = parseFrontmatter(agentContent);
        const filledTemplate = fillTemplate(templateRaw, placeholders);
        const { frontmatter: templateFm, body: templateBody } = parseFrontmatter(filledTemplate);

        // Merge frontmatter: agent values take priority, template adds new keys
        const mergedFm: Record<string, string | string[] | boolean> = {};
        for (const [key, value] of Object.entries(templateFm)) {
          mergedFm[key] = value;
        }
        for (const [key, value] of Object.entries(agentFm)) {
          mergedFm[key] = value; // agent values override template
        }

        const newContent = `---\n${serializeFrontmatter(mergedFm)}\n---\n${templateBody}`;
        await writeFile(agentPath, newContent, 'utf-8');
        merged.push(filename);
      } catch (err) {
        skipped.push({ filename, reason: err instanceof Error ? err.message : 'Failed to merge' });
      }
    }

    return NextResponse.json({ success: true, merged, skipped });
  } catch (err) {
    console.error('Merge error:', err);
    return NextResponse.json({ error: 'Failed to merge agents' }, { status: 500 });
  }
}

/** Build placeholder map from project profile — same logic as generate route */
function buildPlaceholders(projectPath: string, profile: { languages: { name: string }[]; frameworks: { name: string }[]; packageManager: string; libraries: Record<string, string[]> }): Record<string, string> {
  const projectName = path.basename(projectPath);
  const frameworkNames = profile.frameworks.map(f => f.name).join(', ') || 'Unknown';
  const languageNames = profile.languages.map(l => l.name).join(', ') || 'Unknown';
  const libs = profile.libraries;

  const libSections: string[] = [];
  for (const [category, names] of Object.entries(libs)) {
    if (names.length > 0) {
      libSections.push(`${category}: ${names.join(', ')}`);
    }
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
