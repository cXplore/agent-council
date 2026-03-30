import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getProjectConfig, resolveDir } from '@/lib/config';
import { parseMetadata } from '@/lib/meeting-utils';

interface ProjectStatus {
  name: string;
  path: string;
  active: boolean;
  liveMeetings: number;
  totalMeetings: number;
  status: 'meeting' | 'working' | 'idle';
  latestMeetingTitle?: string;
  /** Meetings modified in last 2 hours (for badge on inactive tabs) */
  recentMeetings: number;
  /** Activity log entries in last 2 hours (worker runs, code changes) */
  recentActivity: number;
}

/**
 * GET /api/projects/status — returns live status for ALL connected projects.
 * Used by the nav tab bar to show at-a-glance project state.
 */
export async function GET() {
  try {
    const config = await getConfig();
    const projectNames = Object.keys(config.projects);

    // Include workspace if it has meetings
    const allProjects: { name: string; meetingsDir: string; projectPath: string }[] = [];

    // Add connected projects
    for (const name of projectNames) {
      const pc = getProjectConfig(config, name);
      if (pc) {
        allProjects.push({
          name,
          meetingsDir: pc.meetingsDir,
          projectPath: pc.projectPath ?? '',
        });
      }
    }

    // Add workspace if active or if it has content
    if (config.activeProject === 'workspace' || allProjects.length === 0) {
      allProjects.push({
        name: 'workspace',
        meetingsDir: resolveDir(config.workspace.meetingsDir),
        projectPath: process.cwd(),
      });
    }

    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const recentCutoff = Date.now() - TWO_HOURS_MS;

    // Fetch status for all projects in parallel
    const statuses = await Promise.all(
      allProjects.map(async (proj): Promise<ProjectStatus> => {
        let totalMeetings = 0;
        let liveMeetings = 0;
        let recentMeetings = 0;
        let latestMeetingTitle: string | undefined;
        let latestMtime = 0;

        try {
          const entries = await readdir(proj.meetingsDir);
          const mdFiles = entries.filter(f => f.endsWith('.md') && !f.startsWith('.'));
          totalMeetings = mdFiles.length;

          // Check each meeting file for status (parallel reads)
          const checks = await Promise.all(
            mdFiles.map(async (filename) => {
              try {
                const filePath = path.join(proj.meetingsDir, filename);
                const content = await readFile(filePath, 'utf-8');
                const meta = parseMetadata(content);
                const { stat } = await import('node:fs/promises');
                const fileStat = await stat(filePath);
                return {
                  filename,
                  status: meta.status,
                  title: meta.title,
                  mtime: fileStat.mtimeMs,
                };
              } catch {
                return null;
              }
            })
          );

          for (const check of checks) {
            if (!check) continue;
            if (check.status === 'in-progress') liveMeetings++;
            if (check.mtime > recentCutoff) recentMeetings++;
            if (check.mtime > latestMtime) {
              latestMtime = check.mtime;
              latestMeetingTitle = check.title ?? undefined;
            }
          }
        } catch {
          // Meetings dir doesn't exist — that's fine
        }

        // Count recent activity entries from activity.log
        let recentActivity = 0;
        try {
          const logPath = path.join(proj.meetingsDir, 'activity.log');
          const logContent = await readFile(logPath, 'utf-8');
          const lines = logContent.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.timestamp && new Date(entry.timestamp).getTime() > recentCutoff) {
                recentActivity++;
              }
            } catch { /* skip malformed */ }
          }
        } catch {
          // No activity log — that's fine
        }

        const status: ProjectStatus['status'] =
          liveMeetings > 0 ? 'meeting' : 'idle';

        return {
          name: proj.name,
          path: proj.projectPath,
          active: config.activeProject === proj.name,
          liveMeetings,
          totalMeetings,
          status,
          latestMeetingTitle,
          recentMeetings,
          recentActivity,
        };
      })
    );

    return NextResponse.json({ projects: statuses }, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.error('Project status error:', err);
    return NextResponse.json({ error: 'Failed to get project status' }, { status: 500 });
  }
}
