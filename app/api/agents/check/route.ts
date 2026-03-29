import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { parseFrontmatter, fillTemplate } from '@/lib/agent-templates';
import { scanProject } from '@/lib/scanner';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'agents');

// Simple checksum: sum char codes of the first 500 chars of the body
function simpleHash(text: string): string {
  const slice = text.slice(0, 500);
  let hash = 0;
  for (let i = 0; i < slice.length; i++) {
    hash = ((hash << 5) - hash + slice.charCodeAt(i)) | 0;
  }
  // Convert to unsigned hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function GET() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const agentsDir = active.agentsDir;

    // Load project agents
    let agentFiles: string[];
    try {
      const entries = await readdir(agentsDir);
      agentFiles = entries.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ agents: [], project: active.name, error: 'Agents directory not found' });
      }
      throw err;
    }

    // Load template names
    let templateFiles: string[];
    try {
      const entries = await readdir(TEMPLATES_DIR);
      templateFiles = entries.filter(f => f.endsWith('.md'));
    } catch {
      return NextResponse.json({ agents: [], project: active.name, error: 'Templates directory not found' });
    }

    // Build placeholder values from project profile
    const projectPath = active.projectPath ?? process.cwd();
    let placeholders: Record<string, string> = {};
    try {
      const profile = await scanProject(projectPath);
      const libs = profile.libraries;
      const libSections: string[] = [];
      for (const [category, names] of Object.entries(libs)) {
        if (names.length > 0) libSections.push(`${category}: ${names.join(', ')}`);
      }
      placeholders = {
        PROJECT_NAME: path.basename(projectPath),
        FRAMEWORK: profile.frameworks.map(f => f.name).join(', ') || 'Unknown',
        LANGUAGES: profile.languages.map(l => l.name).join(', ') || 'Unknown',
        PACKAGE_MANAGER: profile.packageManager,
        MEETINGS_DIR: 'meetings',
        LIBRARIES: libSections.length > 0 ? libSections.join('\n') : 'None detected',
        ANIMATION_LIBS: (libs.animation ?? []).join(', ') || 'None installed',
        TESTING_LIBS: (libs.testing ?? []).join(', ') || 'None installed',
        DB_LIBS: (libs.database ?? []).join(', ') || 'None installed',
        UI_LIBS: (libs.ui ?? []).join(', ') || 'None installed',
        THREE_D_LIBS: (libs['3d'] ?? []).join(', ') || 'None installed',
      };
    } catch {
      // If scan fails, compare with raw placeholders (will show as outdated — safe fallback)
    }

    // Build template hash map — fill placeholders before hashing so we compare apples to apples
    const templateHashes: Record<string, string> = {};
    for (const tf of templateFiles) {
      const content = await readFile(path.join(TEMPLATES_DIR, tf), 'utf-8');
      const filled = Object.keys(placeholders).length > 0 ? fillTemplate(content, placeholders) : content;
      const { body } = parseFrontmatter(filled);
      templateHashes[tf] = simpleHash(body.trim());
    }

    // Compare each agent against its template
    const agents = await Promise.all(
      agentFiles.map(async (filename) => {
        const filePath = path.join(agentsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        const name = (frontmatter['name'] as string) ?? filename.replace('.md', '');
        const templateMatch = templateFiles.includes(filename);
        const agentHash = simpleHash(body.trim());
        const templateHash = templateMatch ? templateHashes[filename] : null;

        return {
          name,
          filename,
          templateMatch,
          upToDate: templateMatch ? agentHash === templateHash : null,
          templateHash: templateHash ?? null,
          agentHash,
        };
      }),
    );

    return NextResponse.json({ agents, project: active.name });
  } catch (err) {
    console.error('Agent check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
