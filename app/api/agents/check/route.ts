import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';

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
    } catch (err: any) {
      if (err.code === 'ENOENT') {
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

    // Build template hash map
    const templateHashes: Record<string, string> = {};
    for (const tf of templateFiles) {
      const content = await readFile(path.join(TEMPLATES_DIR, tf), 'utf-8');
      const { body } = parseFrontmatter(content);
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
  } catch (err: any) {
    console.error('Agent check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
