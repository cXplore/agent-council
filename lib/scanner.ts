import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectProfile } from '@/lib/types';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'vendor', 'target', '.cache', '.turbo', '.vercel', '.output',
  'coverage', '.nyc_output', '.venv', 'venv', 'env', '.env',
  'out', 'tmp', 'temp', '.terraform', '.gradle', 'Pods',
  '.svn', '.hg',
]);

const MAX_FILES = 50_000;
const MAX_DEPTH = 15;

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
  '.c': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.h': 'C/C++',
  '.hpp': 'C++',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.php': 'PHP',
  '.dart': 'Dart',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.lua': 'Lua',
  '.zig': 'Zig',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.scala': 'Scala',
  '.r': 'R',
  '.R': 'R',
  '.tf': 'HCL',
  '.proto': 'Protobuf',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
};

// ---------------------------------------------------------------------------
// Recursive file walker — collects file names and directory names
// ---------------------------------------------------------------------------

interface WalkResult {
  files: string[];    // relative file paths
  dirs: Set<string>;  // relative directory paths
  skippedDirs: string[];  // top-level dirs that were skipped
}

async function walk(root: string, rel: string = '', depth: number = 0): Promise<WalkResult> {
  const result: WalkResult = { files: [], dirs: new Set(), skippedDirs: [] };
  if (depth > MAX_DEPTH) return result;

  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (result.files.length >= MAX_FILES) break;

    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        if (depth === 0) result.skippedDirs.push(entry.name);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      result.dirs.add(relPath);
      const sub = await walk(root, relPath, depth + 1);
      for (const f of sub.files) {
        result.files.push(f);
        if (result.files.length >= MAX_FILES) break;
      }
      for (const d of sub.dirs) result.dirs.add(d);
      for (const s of sub.skippedDirs) result.skippedDirs.push(s);
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

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
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

export function detectLanguages(files: string[]): ProjectProfile['languages'] {
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
    const req: Record<string, unknown> = { ...(composer?.require as Record<string, unknown> ?? {}), ...(composer?.['require-dev'] as Record<string, unknown> ?? {}) };
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

  // Python frameworks (from requirements.txt or pyproject.toml)
  if (hasFile(files, 'requirements.txt') || hasFile(files, 'pyproject.toml')) {
    // Quick check for common Python frameworks via directory patterns
    if (hasDir(dirs, 'app') && files.some(f => f.includes('main.py'))) {
      if (!frameworks.some(f => f.name === 'Django')) {
        // Could be FastAPI — check for common indicators
        frameworks.push({ name: 'FastAPI', confidence: 'medium' });
      }
    }
    if (hasFile(files, 'flask') || hasDir(dirs, 'templates')) {
      if (!frameworks.some(f => f.name === 'Django')) {
        frameworks.push({ name: 'Flask', confidence: 'medium' });
      }
    }
  }

  // .NET
  if (hasFile(files, /\.csproj$/) || hasFile(files, /\.sln$/)) {
    frameworks.push({ name: '.NET', confidence: 'high' });
  }

  // Terraform
  if (hasFile(files, /\.tf$/) && hasDir(dirs, '.terraform')) {
    frameworks.push({ name: 'Terraform', confidence: 'high' });
  } else if (hasFile(files, /\.tf$/)) {
    frameworks.push({ name: 'Terraform', confidence: 'medium' });
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
    if (allDeps['tailwindcss']) {
      frameworks.push({ name: 'TailwindCSS', confidence: 'high', version: depVersion('tailwindcss') });
    }
    if (allDeps['electron']) {
      frameworks.push({ name: 'Electron', confidence: 'high', version: depVersion('electron') });
    }
    if (allDeps['@modelcontextprotocol/sdk']) {
      frameworks.push({ name: 'MCP', confidence: 'high', version: depVersion('@modelcontextprotocol/sdk') });
    }
  }

  return frameworks;
}

// ---------------------------------------------------------------------------
// Structure detection
// ---------------------------------------------------------------------------

export function detectStructure(files: string[], dirs: Set<string>): ProjectProfile['structure'] {
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

export function detectPackageManager(files: string[]): ProjectProfile['packageManager'] {
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
// Library detection — what tools are available beyond frameworks
// ---------------------------------------------------------------------------

function detectLibraries(allDeps: Record<string, string>): Record<string, string[]> {
  const libs: Record<string, string[]> = {};

  function check(category: string, npmName: string, displayName: string) {
    if (allDeps[npmName]) {
      if (!libs[category]) libs[category] = [];
      libs[category].push(displayName);
    }
  }

  // Animation & motion
  check('animation', 'motion', 'Motion');
  check('animation', 'framer-motion', 'Framer Motion');
  check('animation', 'gsap', 'GSAP');
  check('animation', 'animejs', 'Anime.js');
  check('animation', 'lottie-web', 'Lottie');
  check('animation', 'lottie-react', 'Lottie React');
  check('animation', 'remotion', 'Remotion');
  check('animation', 'auto-animate', 'AutoAnimate');

  // 3D & WebGL
  check('3d', 'three', 'Three.js');
  check('3d', '@react-three/fiber', 'React Three Fiber');
  check('3d', '@react-three/drei', 'Drei');
  check('3d', '@react-three/postprocessing', 'R3F Postprocessing');

  // Styling
  check('styling', 'tailwindcss', 'TailwindCSS');
  check('styling', '@emotion/react', 'Emotion');
  check('styling', 'styled-components', 'Styled Components');
  check('styling', 'sass', 'Sass');
  check('styling', 'css-modules', 'CSS Modules');

  // Testing
  check('testing', 'vitest', 'Vitest');
  check('testing', 'jest', 'Jest');
  check('testing', '@playwright/test', 'Playwright');
  check('testing', 'cypress', 'Cypress');
  check('testing', '@testing-library/react', 'Testing Library');
  check('testing', 'msw', 'MSW');

  // Database & ORM
  check('database', 'prisma', 'Prisma');
  check('database', '@prisma/client', 'Prisma Client');
  check('database', 'drizzle-orm', 'Drizzle');
  check('database', 'mongoose', 'Mongoose');
  check('database', 'typeorm', 'TypeORM');
  check('database', 'better-sqlite3', 'SQLite');

  // Validation
  check('validation', 'zod', 'Zod');
  check('validation', 'valibot', 'Valibot');
  check('validation', 'yup', 'Yup');
  check('validation', 'joi', 'Joi');

  // API & networking
  check('api', 'trpc', 'tRPC');
  check('api', '@trpc/server', 'tRPC');
  check('api', 'hono', 'Hono');
  check('api', 'axios', 'Axios');
  check('api', 'ky', 'Ky');
  check('api', 'graphql', 'GraphQL');

  // AI & ML
  check('ai', '@anthropic-ai/sdk', 'Anthropic SDK');
  check('ai', 'openai', 'OpenAI SDK');
  check('ai', 'ai', 'Vercel AI SDK');
  check('ai', 'langchain', 'LangChain');
  check('ai', '@modelcontextprotocol/sdk', 'MCP SDK');

  // Monitoring & analytics
  check('monitoring', '@sentry/nextjs', 'Sentry');
  check('monitoring', '@sentry/node', 'Sentry');
  check('monitoring', 'posthog-js', 'PostHog');
  check('monitoring', 'plausible-tracker', 'Plausible');

  // Auth
  check('auth', 'next-auth', 'NextAuth');
  check('auth', '@auth/core', 'Auth.js');
  check('auth', '@clerk/nextjs', 'Clerk');
  check('auth', '@supabase/supabase-js', 'Supabase');
  check('auth', 'lucia', 'Lucia Auth');

  // UI component libraries
  check('ui', '@radix-ui/react-dialog', 'Radix UI');
  check('ui', '@headlessui/react', 'Headless UI');
  check('ui', '@shadcn/ui', 'shadcn/ui');
  check('ui', 'cmdk', 'cmdk');

  // Remove empty categories
  for (const key of Object.keys(libs)) {
    if (libs[key].length === 0) delete libs[key];
  }

  return libs;
}

// ---------------------------------------------------------------------------
// Preset suggestion
// ---------------------------------------------------------------------------

export function suggestPreset(structure: ProjectProfile['structure'], languages: ProjectProfile['languages']): string {
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

export function suggestAgents(
  structure: ProjectProfile['structure'],
  frameworks: ProjectProfile['frameworks'],
): string[] {
  // Always include the mandatory triad + developer
  const agents: string[] = ['project-manager', 'critic', 'north-star', 'developer'];

  if (structure.hasFrontend) agents.push('designer');
  if (structure.hasApi || structure.hasDatabase) agents.push('architect');
  if (structure.hasTests) agents.push('qa-engineer');
  if (structure.hasCICD || structure.hasDocker) agents.push('devops');
  if (structure.hasApi && structure.hasDatabase) agents.push('security-reviewer');
  if (structure.hasApi && structure.hasFrontend && structure.hasTests) agents.push('tech-writer');

  // Add domain expert for specialized frameworks
  const hasInfra = frameworks.some(f => f.name === 'Terraform' || f.name === '.NET');
  if (hasInfra && !agents.includes('domain-expert')) agents.push('domain-expert');

  return agents;
}

// ---------------------------------------------------------------------------
// Coverage boundaries — what agents know vs. don't know
// ---------------------------------------------------------------------------

export function detectCoverageBoundaries(
  files: string[],
  dirs: Set<string>,
  skippedDirs: string[],
  structure: ProjectProfile['structure'],
  frameworks: ProjectProfile['frameworks'],
  languages: ProjectProfile['languages'],
  libraries: Record<string, string[]>,
): NonNullable<ProjectProfile['coverageBoundaries']> {
  // Known domains: what the scanner can confidently describe
  const knownDomains: string[] = [];
  const unknownDomains: string[] = [];

  // Language-based knowledge
  for (const lang of languages) {
    if (lang.percentage >= 5) {
      knownDomains.push(`${lang.name} code patterns`);
    }
  }

  // Framework knowledge
  for (const fw of frameworks) {
    if (fw.confidence === 'high') {
      knownDomains.push(`${fw.name} architecture${fw.version ? ` (${fw.version})` : ''}`);
    } else {
      unknownDomains.push(`${fw.name} (detected but not deeply analyzed)`);
    }
  }

  // Structure-based knowledge
  if (structure.hasFrontend) knownDomains.push('Frontend component structure');
  if (structure.hasApi) knownDomains.push('API route layout');
  if (structure.hasTests) knownDomains.push('Test file organization');
  if (structure.isMonorepo) knownDomains.push('Monorepo workspace layout');

  // Structure-based unknowns — things we see exist but can't deeply analyze
  if (structure.hasDatabase) unknownDomains.push('Database schema and migrations (files detected, content not analyzed)');
  if (structure.hasCICD) unknownDomains.push('CI/CD pipeline logic (config detected, behavior not analyzed)');
  if (structure.hasDocker) unknownDomains.push('Container configuration (Dockerfile detected, runtime behavior unknown)');

  // Library-based unknowns — dependencies exist but we don't analyze their usage
  const libCategories = Object.keys(libraries).filter(k => (libraries[k]?.length ?? 0) > 0);
  if (libCategories.length > 0) {
    unknownDomains.push(`Library usage patterns (${libCategories.length} categories detected, actual usage not traced)`);
  }

  // Universal unknowns
  unknownDomains.push('Runtime behavior and environment variables');
  unknownDomains.push('Business logic semantics (file structure visible, intent requires reading)');
  unknownDomains.push('External service integrations (dependencies listed, contracts unknown)');
  unknownDomains.push('Git history and recent changes (not scanned)');

  // Scanned vs skipped paths
  const topLevelDirs = [...dirs].filter(d => !d.includes('/')).sort();

  return {
    knownDomains,
    unknownDomains,
    scannedPaths: topLevelDirs,
    skippedPaths: skippedDirs.sort(),
    filesCovered: files.length,
    filesEstimatedTotal: files.length, // We can't easily know what's in skipped dirs
  };
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

  const { files, dirs, skippedDirs } = await walk(dirPath);
  const languages = detectLanguages(files);
  const frameworks = await detectFrameworks(dirPath, files, dirs);
  const structure = detectStructure(files, dirs);
  const packageManager = detectPackageManager(files);
  const suggestedPreset = suggestPreset(structure, languages);
  const suggestedAgents = suggestAgents(structure, frameworks);

  // Detect installed libraries from package.json
  const pkg = await readJson(path.join(dirPath, 'package.json'));
  const allDeps: Record<string, string> = {
    ...(pkg?.dependencies as Record<string, string> ?? {}),
    ...(pkg?.devDependencies as Record<string, string> ?? {}),
  };
  const libraries = detectLibraries(allDeps);

  const coverageBoundaries = detectCoverageBoundaries(
    files, dirs, skippedDirs, structure, frameworks, languages, libraries,
  );

  return {
    languages,
    frameworks,
    structure,
    packageManager,
    libraries,
    suggestedPreset,
    suggestedAgents,
    coverageBoundaries,
  };
}
