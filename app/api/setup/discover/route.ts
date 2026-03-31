import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '@/lib/config';
import { scanProject } from '@/lib/scanner';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.cache', '.vercel',
  '__pycache__', '.venv', 'venv', 'dist', 'build', '.output',
]);

export async function GET() {
  try {
    const config = await getConfig();
    const connectedPaths = new Set(
      Object.values(config.projects).map(p => path.resolve(p.path))
    );

    // Gather parent directories of all connected projects
    const parentDirs = new Set<string>();
    for (const p of connectedPaths) {
      parentDirs.add(path.dirname(p));
    }

    const candidates: Array<{
      path: string;
      name: string;
      isGitRepo: boolean;
      languages: Array<{ name: string; percentage: number }>;
      frameworks: string[];
      projectDescription: string | null;
      alreadyConnected: boolean;
    }> = [];

    for (const parentDir of parentDirs) {
      let entries;
      try {
        entries = await readdir(parentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;

        const candidatePath = path.resolve(parentDir, entry.name);
        if (connectedPaths.has(candidatePath)) continue;

        // Quick check: does it look like a project? (has package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
        const projectMarkers = [
          'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml',
          'requirements.txt', 'Gemfile', 'pom.xml', 'build.gradle',
          'composer.json', 'mix.exs', 'pubspec.yaml',
        ];
        let isProject = false;
        for (const marker of projectMarkers) {
          try {
            await stat(path.join(candidatePath, marker));
            isProject = true;
            break;
          } catch {
            // not found
          }
        }
        if (!isProject) continue;

        // Check for git repo
        let isGitRepo = false;
        try {
          await stat(path.join(candidatePath, '.git'));
          isGitRepo = true;
        } catch {
          // not a git repo
        }

        // Light scan
        try {
          const profile = await scanProject(candidatePath);
          candidates.push({
            path: candidatePath,
            name: entry.name,
            isGitRepo,
            languages: (profile.languages || []).slice(0, 3).map(l => ({
              name: l.name,
              percentage: l.percentage,
            })),
            frameworks: (profile.frameworks || []).map(f => f.name),
            projectDescription: profile.projectDescription || null,
            alreadyConnected: false,
          });
        } catch {
          // Scan failed — skip this candidate
        }
      }
    }

    // Sort by name
    candidates.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
