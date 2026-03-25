import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, resolveDir } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dirParam = searchParams.get('dir');

    let agentsDir: string;
    if (dirParam) {
      // Resolve and constrain to .claude/agents within the given directory
      const resolved = path.resolve(dirParam);
      agentsDir = path.join(resolved, '.claude', 'agents');
    } else {
      const config = await getConfig();
      agentsDir = resolveDir(config.agentsDir);
    }

    // List .md files in the agents directory
    let files: string[];
    try {
      const entries = await readdir(agentsDir);
      files = entries.filter(f => f.endsWith('.md'));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json(
          { error: 'Agents directory not found' },
          { status: 404 },
        );
      }
      throw err;
    }

    // Parse each agent file
    const agents = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(agentsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        return {
          filename,
          name: frontmatter['name'] ?? filename.replace('.md', ''),
          description: frontmatter['description'] ?? '',
          model: frontmatter['model'] ?? '',
          tools: frontmatter['tools']
            ? frontmatter['tools'].split(',').map((t: string) => t.trim())
            : [],
        };
      }),
    );

    return NextResponse.json(agents);
  } catch (err: any) {
    console.error('Agents list error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
