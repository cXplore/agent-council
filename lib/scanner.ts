import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectProfile } from '@/lib/types';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'vendor', 'target', '.cache', '.turbo', '.vercel', '.output',
  'coverage', '.nyc_output',
]);

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.h': 'C++',
  '.hpp': 'C++',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.php': 'PHP',
  '.dart': 'Dart',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
};

// ---------------------------------------------------------------------------
// Recursive file walker — collects file names and directory names
// ---------------------------------------------------------------------------

interface WalkResult {
  files: string[];    // relative file paths
  dirs: Set<string>;  // relative directory paths
}

async function walk(root: string, rel: string = ''): Promise<WalkResult> {
  const result: WalkResult = { files: [], dirs: new Set() };
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      result.dirs.add(relPath);
      const sub = await walk(root, relPath);
      for (const f of sub.files) result.files.push(f);
      for (const d of sub.dirs) result.dirs.add(d);
    } else if (entry.isFile()) {
      result.files.push(relPath);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers to check for file existence
// ---------------------------------------------------------------------------

function hasFile(files: string[], pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return files.some(f => {
      const base = f.split('/').pop() ?? '';
      return base === pattern;
    });
  }
  return files.some(f => pattern.test(f));
}

function hasFileGlob(files: string[], prefix: string): boolean {
  return files.some(f => {
    const base = f.split('/').pop() ?? '';
    return base.startsWith(prefix);
  });
}

function hasDir(dirs: Set<string>, name: string): boolean {
  return dirs.has(name) || [...dirs].some(d => d.endsWith(`/${name}`) || d.startsWith(`${name}/`));
}

function hasDirExact(dirs: Set<string>, name: string): boolean {
  return dirs.has(name);
}

// ---------------------------------------------------------------------------
// Safe JSON read
// ---------------------------------------------------------------------------

async function readJson(filePath: string): Promise<any | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function detectLanguages(files: string[]): ProjectProfile['languages'] {
  const counts: Record<string, number> = {};

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const lang = EXT_TO_LANGUAGE[ext];
    if (lang) {
      counts[lang] = (counts[lang] ?? 0) + 1;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  return Object.entries(counts)
    .map(([name, fileCount]) => ({
      name,
      fileCount,
      percentage: Math.round((fileCount / total) * 100),
    }))
    .sort((a, b) => b.fileCount - a.fileCount);
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

async function detectFrameworks(
  dirPath: string,
  files: string[],
  dirs: Set<string>,
): Promise<ProjectProfile['frameworks']> {
  const frameworks: ProjectProfile['frameworks'] = [];

  // Helper to get version from package.json dependencies
  const pkg = await readJson(path.join(dirPath, 'package.json'));
  const allDeps: Record<string, string> = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };

  function depVersion(name: string): string | undefined {
    const v = allDeps[name];
    return v ? v.replace(/^[\^~>=<]+/, '') : undefined;
  }

  // Next.js
  if (hasFileGlob(files, 'next.config')) {
    frameworks.push({ name: 'Next.js', confidence: 'high', version: depVersion('next') });
  } else if (allDeps['next']) {
    frameworks.push({ name: 'Next.js', confidence: 'medium', version: depVersion('next') });
  }

  // Vite
  if (hasFileGlob(files, 'vite.config')) {
    frameworks.push({ name: 'Vite', confidence: 'high', version: depVersion('vite') });
  }

  // Angular
  if (hasFile(files, 'angular.json')) {
    frameworks.push({ name: 'Angular', confidence: 'high', version: depVersion('@angular/core') });
  }

  // Django
  if (hasFile(files, 'manage.py') && hasFile(files, 'requirements.txt')) {
    frameworks.push({ name: 'Django', confidence: 'high' });
  }

  // Rust / Cargo
  if (hasFile(files, 'Cargo.toml')) {
    frameworks.push({ name: 'Rust/Cargo', confidence: 'high' });
  }

  // Go
  if (hasFile(files, 'go.mod')) {
    frameworks.push({ name: 'Go', confidence: 'high' });
  }

  // Java / Spring / Gradle / Maven
  if (hasFile(files, 'build.gradle') || hasFile(files, 'build.gradle.kts')) {
    frameworks.push({ name: 'Gradle', confidence: 'high' });
  }
  if (hasFile(files, 'pom.xml')) {
    frameworks.push({ name: 'Maven', confidence: 'high' });
  }

  // Rails
  if (hasFile(files, 'Gemfile') && hasFile(files, /config\/routes\.rb$/)) {
    frameworks.push({ name: 'Rails', confidence: 'high' });
  }

  // Laravel / PHP
  if (hasFile(files, 'composer.json')) {
    const composer = await readJson(path.join(dirPath, 'composer.json'));
    const req = { ...(composer?.require ?? {}), ...(composer?.['require-dev'] ?? {}) };
    if (req['laravel/framework']) {
      frameworks.push({ name: 'Laravel', confidence: 'high' });
    } else {
      frameworks.push({ name: 'PHP/Composer', confidence: 'medium' });
    }
  }

  // Flutter / Dart
  if (hasFile(files, 'pubspec.yaml')) {
    frameworks.push({ name: 'Flutter/Dart', confidence: 'high' });
  }

  // Package.json-based detection (React, Vue, Svelte, Express, etc.)
  if (pkg) {
    if (allDeps['react'] && !frameworks.some(f => f.name === 'Next.js')) {
      frameworks.push({ name: 'React', confidence: 'high', version: depVersion('react') });
    }
    if (allDeps['vue']) {
      frameworks.push({ name: 'Vue', confidence: 'high', version: depVersion('vue') });
    }
    if (allDeps['svelte'] || allDeps['@sveltejs/kit']) {
      frameworks.push({
        name: allDeps['@sveltejs/kit'] ? 'SvelteKit' : 'Svelte',
        confidence: 'high',
        version: depVersion('svelte') ?? depVersion('@sveltejs/kit'),
      });
    }
    if (allDeps['express']) {
      frameworks.push({ name: 'Express', confidence: 'high', version: depVersion('express') });
    }
    if (allDeps['fastify']) {
      frameworks.push({ name: 'Fastify', confidence: 'high', version: depVersion('fastify') });
    }
    if (allDeps['@nestjs/core']) {
      frameworks.push({ name: 'NestJS', confidence: 'high', version: depVersion('@nestjs/core') });
    }
    if (allDeps['nuxt'] || allDeps['nuxt3']) {
      frameworks.push({ name: 'Nuxt', confidence: 'high', version: depVersion('nuxt') ?? depVersion('nuxt3') });
    }
    if (allDeps['astro']) {
      frameworks.push({ name: 'Astro', confidence: 'high', version: depVersion('astro') });
    }
    if (allDeps['remix'] || allDeps['@remix-run/react']) {
      frameworks.push({ name: 'Remix', confidence: 'high' });
    }
  }

  return frameworks;
}

// ---------------------------------------------------------------------------
// Structure detection
// ---------------------------------------------------------------------------

function detectStructure(files: string[], dirs: Set<string>): ProjectProfile['structure'] {
  // API detection
  const hasApi =
    hasDirExact(dirs, 'app/api') ||
    hasDirExact(dirs, 'src/api') ||
    hasDirExact(dirs, 'api') ||
    hasDirExact(dirs, 'routes') ||
    hasDirExact(dirs, 'controllers') ||
    hasDirExact(dirs, 'src/routes') ||
    hasDirExact(dirs, 'src/controllers');

  // Frontend detection
  const hasFrontend =
    hasDirExact(dirs, 'components') ||
    hasDirExact(dirs, 'src/components') ||
    hasDirExact(dirs, 'pages') ||
    hasDirExact(dirs, 'views') ||
    hasDirExact(dirs, 'src/views') ||
    files.some(f => f.startsWith('app/') && (f.endsWith('.tsx') || f.endsWith('.jsx')));

  // Database detection
  const hasDatabase =
    hasDirExact(dirs, 'prisma') ||
    hasDirExact(dirs, 'migrations') ||
    hasDirExact(dirs, 'drizzle') ||
    hasFile(files, /\.prisma$/) ||
    hasFile(files, 'schema.sql') ||
    hasFile(files, 'knexfile.js') ||
    hasFile(files, 'knexfile.ts') ||
    hasFile(files, /models\/.*\.(ts|js|py|rb)$/);

  // Test detection
  const hasTests =
    hasDirExact(dirs, 'tests') ||
    hasDirExact(dirs, '__tests__') ||
    hasDirExact(dirs, 'test') ||
    hasDirExact(dirs, 'spec') ||
    hasFile(files, /\.(test|spec)\.(ts|tsx|js|jsx|py|rb)$/) ||
    hasFileGlob(files, 'vitest.config') ||
    hasFileGlob(files, 'jest.config') ||
    hasFile(files, 'pytest.ini') ||
    hasFile(files, 'setup.cfg');

  // CI/CD detection
  const hasCICD =
    hasDir(dirs, '.github/workflows') ||
    hasFile(files, '.gitlab-ci.yml') ||
    hasFile(files, 'Jenkinsfile') ||
    hasDir(dirs, '.circleci');

  // Monorepo detection
  const isMonorepo =
    hasDirExact(dirs, 'packages') ||
    hasDirExact(dirs, 'apps') ||
    hasFile(files, 'turbo.json') ||
    hasFile(files, 'pnpm-workspace.yaml') ||
    hasFile(files, 'lerna.json');

  // Docker detection
  const hasDocker =
    hasFile(files, 'Dockerfile') ||
    hasFile(files, 'docker-compose.yml') ||
    hasFile(files, 'docker-compose.yaml');

  return { hasApi, hasFrontend, hasDatabase, hasTests, hasCICD, isMonorepo, hasDocker };
}

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

function detectPackageManager(files: string[]): ProjectProfile['packageManager'] {
  if (hasFile(files, 'pnpm-lock.yaml')) return 'pnpm';
  if (hasFile(files, 'bun.lockb') || hasFile(files, 'bun.lock')) return 'bun';
  if (hasFile(files, 'yarn.lock')) return 'yarn';
  if (hasFile(files, 'package-lock.json')) return 'npm';
  if (hasFile(files, 'Pipfile.lock') || hasFile(files, 'requirements.txt')) return 'pip';
  if (hasFile(files, 'Cargo.lock')) return 'cargo';
  if (hasFile(files, 'go.sum')) return 'go';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Preset suggestion
// ---------------------------------------------------------------------------

function suggestPreset(structure: ProjectProfile['structure'], languages: ProjectProfile['languages']): string {
  const { hasApi, hasFrontend, hasTests } = structure;

  if (hasApi && hasFrontend && hasTests) return 'full-stack';
  if (hasFrontend && !hasApi) return 'standard';
  if (hasApi && !hasFrontend) return 'standard';

  // Small project heuristic: few source files
  const totalFiles = languages.reduce((sum, l) => sum + l.fileCount, 0);
  if (totalFiles < 20) return 'minimal';

  return 'standard';
}

// ---------------------------------------------------------------------------
// Agent suggestion based on project shape
// ---------------------------------------------------------------------------

function suggestAgents(
  structure: ProjectProfile['structure'],
  _frameworks: ProjectProfile['frameworks'],
): string[] {
  // Always include the mandatory triad + developer
  const agents: string[] = ['project-manager', 'critic', 'north-star', 'developer'];

  if (structure.hasFrontend) agents.push('designer');
  if (structure.hasApi || structure.hasDatabase) agents.push('architect');
  if (structure.hasTests) agents.push('qa-engineer');
  if (structure.hasCICD || structure.hasDocker) agents.push('devops');
  if (structure.hasApi && structure.hasDatabase) agents.push('security-reviewer');
  if (structure.hasApi && structure.hasFrontend && structure.hasTests) agents.push('tech-writer');

  return agents;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scanProject(dirPath: string): Promise<ProjectProfile> {
  // Verify directory exists
  const dirStat = await stat(dirPath);
  if (!dirStat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }

  const { files, dirs } = await walk(dirPath);
  const languages = detectLanguages(files);
  const frameworks = await detectFrameworks(dirPath, files, dirs);
  const structure = detectStructure(files, dirs);
  const packageManager = detectPackageManager(files);
  const suggestedPreset = suggestPreset(structure, languages);
  const suggestedAgents = suggestAgents(structure, frameworks);

  return {
    languages,
    frameworks,
    structure,
    packageManager,
    suggestedPreset,
    suggestedAgents,
  };
}
