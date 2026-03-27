import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// MCP config entry for Agent Council
function getMcpEntry(serverPath: string) {
  return {
    command: 'node',
    args: [serverPath.replace(/\\/g, '/')],
  };
}

// Detect Claude config file locations
function getConfigPaths() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const appData = process.env.APPDATA || '';

  return {
    // Claude Code CLI — global settings
    claudeCode: path.join(home, '.claude', 'settings.json'),
    // Claude Desktop app
    claudeDesktop: process.platform === 'win32'
      ? path.join(appData, 'Claude', 'claude_desktop_config.json')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
  };
}

// GET — check MCP configuration status
export async function GET() {
  const paths = getConfigPaths();
  const serverPath = path.join(process.cwd(), 'mcp', 'server.mjs');
  const serverExists = existsSync(serverPath);

  const results: Record<string, { exists: boolean; configured: boolean; path: string }> = {};

  for (const [name, configPath] of Object.entries(paths)) {
    const exists = existsSync(configPath);
    let configured = false;

    if (exists) {
      try {
        const content = await readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        const servers = config.mcpServers || {};
        configured = !!servers['agent-council'];
      } catch {
        // Malformed JSON — treat as not configured
      }
    }

    results[name] = { exists, configured, path: configPath };
  }

  return NextResponse.json({
    serverPath,
    serverExists,
    targets: results,
  });
}

// POST — configure MCP in one or both config files
export async function POST(req: Request) {
  try {
    const { targets } = await req.json() as { targets: string[] };

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: 'No targets specified' }, { status: 400 });
    }

    const paths = getConfigPaths();
    const serverPath = path.join(process.cwd(), 'mcp', 'server.mjs');

    if (!existsSync(serverPath)) {
      return NextResponse.json({ error: 'MCP server file not found' }, { status: 404 });
    }

    const mcpEntry = getMcpEntry(serverPath);
    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const target of targets) {
      const configPath = paths[target as keyof typeof paths];
      if (!configPath) {
        results[target] = { success: false, error: 'Unknown target' };
        continue;
      }

      try {
        let config: Record<string, unknown> = {};

        if (existsSync(configPath)) {
          const content = await readFile(configPath, 'utf-8');
          config = JSON.parse(content);
        } else {
          // Create parent directory if needed
          await mkdir(path.dirname(configPath), { recursive: true });
        }

        // Add or update the mcpServers entry
        if (!config.mcpServers || typeof config.mcpServers !== 'object') {
          config.mcpServers = {};
        }
        (config.mcpServers as Record<string, unknown>)['agent-council'] = mcpEntry;

        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        results[target] = { success: true };
      } catch (err) {
        results[target] = {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to write config',
        };
      }
    }

    return NextResponse.json({ success: true, results });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
