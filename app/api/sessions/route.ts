import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfig } from '@/lib/config';

interface SessionInfo {
  id: string;
  title: string;
  firstMessage: string;
  lastActivity: string;
  messageCount: number;
  isActive: boolean;
  project: string;
}

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

function projectPathToClaudeDir(projectPath: string): string {
  // Claude Code stores projects as path with separators replaced by --
  // e.g., C:\Projects\my-app -> C--Projects-my-app
  return projectPath
    .replace(/^\//, '')           // Remove leading /
    .replace(/^([A-Z]):/, '$1')   // C: -> C
    .replace(/[\\/]/g, '-')       // Slashes to hyphens
    .replace(/--+/g, '-');        // Collapse multiple hyphens... actually Claude uses --
}

function findClaudeDir(projectPath: string): string | null {
  const claudeDir = getClaudeProjectsDir();
  if (!fs.existsSync(claudeDir)) return null;

  // Claude Code stores paths as: C:/Projects/foo -> C--Projects-foo
  // Drive letter keeps letter, :/ becomes --, / becomes -
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
  const expected = normalized
    .replace(/:\//, '--')      // C:/ -> C--
    .replace(/\//g, '-');      // remaining / -> -

  // Find matching dir (exact match, not worktrees)
  const dirs = fs.readdirSync(claudeDir);
  for (const dir of dirs) {
    if (dir === expected) {
      return path.join(claudeDir, dir);
    }
  }

  return null;
}

function parseSessionFile(filePath: string, projectName: string): SessionInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) return null;

    let firstUserMessage = '';
    let messageCount = 0;
    let lastTimestamp = '';
    const id = path.basename(filePath, '.jsonl');

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Track timestamps
        if (entry.timestamp) {
          lastTimestamp = entry.timestamp;
        }

        // Count user messages
        if (entry.type === 'user') {
          messageCount++;
          if (!firstUserMessage && entry.message?.content) {
            const content = typeof entry.message.content === 'string'
              ? entry.message.content
              : JSON.stringify(entry.message.content);
            firstUserMessage = content.replace(/\n/g, ' ').trim();
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (!firstUserMessage) return null;

    // Consider "active" if modified in the last 5 minutes
    const stat = fs.statSync(filePath);
    const modifiedAgo = Date.now() - stat.mtimeMs;
    const isActive = modifiedAgo < 5 * 60 * 1000;

    // Generate title from first message (truncate cleanly)
    const title = firstUserMessage.length > 80
      ? firstUserMessage.slice(0, 77) + '...'
      : firstUserMessage;

    return {
      id,
      title,
      firstMessage: firstUserMessage,
      lastActivity: lastTimestamp || stat.mtime.toISOString(),
      messageCount,
      isActive,
      project: projectName,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const config = await getConfig();
    const sessions: SessionInfo[] = [];

    // Get sessions for active project
    const activeProject = config.activeProject || 'workspace';
    const projectConfig = activeProject === 'workspace'
      ? null
      : config.projects?.[activeProject];

    if (projectConfig?.path) {
      const claudeDir = findClaudeDir(projectConfig.path);

      if (claudeDir) {
        const files = fs.readdirSync(claudeDir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({
            name: f,
            path: path.join(claudeDir, f),
            mtime: fs.statSync(path.join(claudeDir, f)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 20); // Last 20 sessions

        for (const file of files) {
          const session = parseSessionFile(file.path, activeProject);
          if (session) {
            sessions.push(session);
          }
        }
      }
    }

    return NextResponse.json({
      sessions,
      project: activeProject,
      claudeDataFound: sessions.length > 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read sessions' },
      { status: 500 }
    );
  }
}
