import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectParam = searchParams.get('project');
    const dirParam = searchParams.get('dir');

    let agentsDir: string;
    let projectName: string;

    if (dirParam) {
      // Direct directory override (legacy support)
      const resolved = path.resolve(dirParam);
      agentsDir = path.join(resolved, '.claude', 'agents');
      projectName = path.basename(resolved);
    } else if (projectParam) {
      // Specific project by name
      const config = await getConfig();
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      agentsDir = projectConfig.agentsDir;
      projectName = projectParam;
    } else {
      // Active project
      const config = await getConfig();
      const active = getActiveProjectConfig(config);
      agentsDir = active.agentsDir;
      projectName = active.name;
    }

    let files: string[];
    try {
      const entries = await readdir(agentsDir);
      files = entries.filter(f => f.endsWith('.md'));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json({ agents: [], project: projectName, error: 'Agents directory not found' });
      }
      throw err;
    }

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

    return NextResponse.json({ agents, project: projectName });
  } catch (err: any) {
    console.error('Agents list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
