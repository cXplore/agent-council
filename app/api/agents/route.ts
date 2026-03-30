import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { parseFrontmatter, serializeFrontmatter } from '@/lib/agent-templates';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectParam = searchParams.get('project');

    let agentsDir: string;
    let projectName: string;

    if (projectParam) {
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
      files = entries.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ agents: [], project: projectName, error: 'Agents directory not found' });
      }
      throw err;
    }

    const agents = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(agentsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        return {
          filename,
          name: frontmatter['name'] ?? filename.replace('.md', ''),
          description: frontmatter['description'] ?? '',
          model: frontmatter['model'] ?? '',
          tools: Array.isArray(frontmatter['tools'])
            ? frontmatter['tools']
            : typeof frontmatter['tools'] === 'string'
              ? frontmatter['tools'].split(',').map((t: string) => t.trim())
              : [],
          team: frontmatter['team'] ?? '',
          role: frontmatter['role'] ?? 'member',
          required: frontmatter['required'] === 'true',
          content: body.trim(),
        };
      }),
    );

    return NextResponse.json({ agents, project: projectName });
  } catch (err) {
    console.error('Agents list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { filename, content } = body;

    if (!filename || !content) {
      return NextResponse.json({ error: 'filename and content are required' }, { status: 400 });
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const safeName = path.basename(filename);

    if (!safeName.endsWith('.md')) {
      return NextResponse.json({ error: 'Invalid filename: must be a .md file' }, { status: 400 });
    }

    const filePath = path.join(active.agentsDir, safeName);
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(active.agentsDir);
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Validate content has frontmatter
    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter['name']) {
      return NextResponse.json({ error: 'Content must include frontmatter with at least a name field' }, { status: 400 });
    }

    await writeFile(filePath, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Agent write error:', err);
    return NextResponse.json({ error: 'Failed to write agent' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { filename, field, value } = body;

    if (!filename || !field || value === undefined) {
      return NextResponse.json({ error: 'filename, field, and value are required' }, { status: 400 });
    }

    // Only allow safe fields to be edited directly
    const allowedFields = ['model', 'team', 'role', 'description'];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: `Cannot edit field: ${field}` }, { status: 400 });
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const safeName = path.basename(filename);

    // Validate: must be a .md file
    if (!safeName.endsWith('.md')) {
      return NextResponse.json({ error: 'Invalid filename: must be a .md file' }, { status: 400 });
    }

    const filePath = path.join(active.agentsDir, safeName);

    // Validate: resolved path must stay within agents directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(active.agentsDir);
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const content = await readFile(filePath, 'utf-8');
    const { frontmatter, body: mdBody } = parseFrontmatter(content);

    frontmatter[field] = value;

    const newContent = `---\n${serializeFrontmatter(frontmatter)}\n---\n${mdBody}`;
    await writeFile(filePath, newContent, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Agent update error:', err);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}
