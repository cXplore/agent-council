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

    // Fetch status for all projects in parallel
    const statuses = await Promise.all(
      allProjects.map(async (proj): Promise<ProjectStatus> => {
        let totalMeetings = 0;
        let liveMeetings = 0;
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
            if (check.mtime > latestMtime) {
              latestMtime = check.mtime;
              latestMeetingTitle = check.title ?? undefined;
            }
          }
        } catch {
          // Meetings dir doesn't exist — that's fine
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
