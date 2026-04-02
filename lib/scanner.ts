import { readdir, stat, lstat, readFile } from 'node:fs/promises';
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
  truncated: boolean;  // true if MAX_FILES cap was hit
}

async function walk(root: string, rel: string = '', depth: number = 0): Promise<WalkResult> {
  const result: WalkResult = { files: [], dirs: new Set(), skippedDirs: [], truncated: false };
  if (depth > MAX_DEPTH) return result;

  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (result.files.length >= MAX_FILES) {
      result.truncated = true;
      break;
    }

    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      // Resolve symlinks: check if target is a directory, skip to avoid loops
      if (entry.isSymbolicLink()) {
        try {
          const targetStat = await stat(path.join(root, relPath));
          if (!targetStat.isDirectory()) continue; // symlink to file — skip
        } catch {
          continue; // broken symlink — skip
        }
        // It's a symlink to a directory — skip to prevent cycles
        continue;
      }
      if (SKIP_DIRS.has(entry.name)) {
        if (depth === 0) result.skippedDirs.push(entry.name);
        continue;
      }
      result.dirs.add(relPath);
      const sub = await walk(root, relPath, depth + 1);
      for (const f of sub.files) {
        result.files.push(f);
        if (result.files.length >= MAX_FILES) {
          result.truncated = true;
          break;
        }
      }
      if (sub.truncated) result.truncated = true;
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

  // Python frameworks — read requirements.txt/pyproject.toml for actual dependency names
  if (hasFile(files, 'requirements.txt') || hasFile(files, 'pyproject.toml')) {
    let pyDeps = '';
    try {
      if (hasFile(files, 'requirements.txt')) {
        pyDeps += await readFile(path.join(dirPath, 'requirements.txt'), 'utf-8');
      }
    } catch { /* ignore */ }
    try {
      if (hasFile(files, 'pyproject.toml')) {
        pyDeps += await readFile(path.join(dirPath, 'pyproject.toml'), 'utf-8');
      }
    } catch { /* ignore */ }
    const pyDepsLower = pyDeps.toLowerCase();

    if (pyDepsLower.includes('fastapi') && !frameworks.some(f => f.name === 'Django')) {
      frameworks.push({ name: 'FastAPI', confidence: 'high' });
    }
    if (pyDepsLower.includes('flask') && !frameworks.some(f => f.name === 'Django')) {
      frameworks.push({ name: 'Flask', confidence: 'high' });
    }
    if (pyDepsLower.includes('starlette') && !frameworks.some(f => f.name.includes('FastAPI'))) {
      frameworks.push({ name: 'Starlette', confidence: 'medium' });
    }
    if (pyDepsLower.includes('celery')) {
      frameworks.push({ name: 'Celery', confidence: 'high' });
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

/**
 * Detect Python libraries from requirements.txt or pyproject.toml.
 * Returns libraries in the same category-based format as detectLibraries.
 */
async function detectPythonLibraries(
  dirPath: string,
  files: string[],
): Promise<Record<string, string[]>> {
  const libs: Record<string, string[]> = {};
  let content = '';

  try {
    if (hasFile(files, 'requirements.txt')) {
      content += await readFile(path.join(dirPath, 'requirements.txt'), 'utf-8');
    }
  } catch { /* ignore */ }
  try {
    if (hasFile(files, 'pyproject.toml')) {
      content += '\n' + await readFile(path.join(dirPath, 'pyproject.toml'), 'utf-8');
    }
  } catch { /* ignore */ }

  if (!content) return libs;
  const lower = content.toLowerCase();

  function check(category: string, pkgName: string, displayName: string) {
    if (lower.includes(pkgName)) {
      if (!libs[category]) libs[category] = [];
      if (!libs[category].includes(displayName)) libs[category].push(displayName);
    }
  }

  // Testing
  check('testing', 'pytest', 'pytest');
  check('testing', 'unittest', 'unittest');
  check('testing', 'tox', 'tox');
  check('testing', 'coverage', 'coverage');
  check('testing', 'hypothesis', 'Hypothesis');

  // Database & ORM
  check('database', 'sqlalchemy', 'SQLAlchemy');
  check('database', 'alembic', 'Alembic');
  check('database', 'tortoise-orm', 'Tortoise ORM');
  check('database', 'peewee', 'Peewee');
  check('database', 'psycopg', 'psycopg');
  check('database', 'pymongo', 'PyMongo');
  check('database', 'redis', 'Redis');

  // API & networking
  check('api', 'requests', 'Requests');
  check('api', 'httpx', 'HTTPX');
  check('api', 'aiohttp', 'aiohttp');
  check('api', 'grpcio', 'gRPC');
  check('api', 'graphene', 'Graphene');
  check('api', 'pydantic', 'Pydantic');

  // AI & ML
  check('ai', 'openai', 'OpenAI SDK');
  check('ai', 'anthropic', 'Anthropic SDK');
  check('ai', 'langchain', 'LangChain');
  check('ai', 'transformers', 'Transformers');
  check('ai', 'torch', 'PyTorch');
  check('ai', 'tensorflow', 'TensorFlow');
  check('ai', 'scikit-learn', 'scikit-learn');
  check('ai', 'numpy', 'NumPy');
  check('ai', 'pandas', 'pandas');

  // Auth
  check('auth', 'python-jose', 'python-jose');
  check('auth', 'pyjwt', 'PyJWT');
  check('auth', 'passlib', 'Passlib');
  check('auth', 'authlib', 'Authlib');

  // Monitoring
  check('monitoring', 'sentry-sdk', 'Sentry');
  check('monitoring', 'prometheus', 'Prometheus');
  check('monitoring', 'structlog', 'structlog');

  // Validation
  check('validation', 'pydantic', 'Pydantic');
  check('validation', 'marshmallow', 'Marshmallow');
  check('validation', 'cerberus', 'Cerberus');

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
// Scan quality scoring — determines "reveal" vs "generic setup" onboarding path
// ---------------------------------------------------------------------------

export type ScanQuality = 'rich' | 'basic' | 'minimal';

export interface ScanQualityResult {
  quality: ScanQuality;
  score: number;           // 0-10 composite score
  signals: string[];       // human-readable signals that contributed to the score
  missingSignals: string[]; // what the scan could NOT detect
}

/**
 * Scores the scan output to determine onboarding path:
 * - "rich" (score >= 6): Show project-specific reveal with interpreted judgment
 * - "basic" (score 3-5): Show partial reveal with fallback options
 * - "minimal" (score 0-2): Generic setup — not enough signal for personalization
 *
 * Thresholds:
 * - At least 1 language detected (1 point)
 * - At least 1 high-confidence framework (2 points)
 * - At least 2 structure signals (hasApi, hasFrontend, etc.) (1 point per, max 2)
 * - Package manager detected (not "unknown") (1 point)
 * - At least 1 library category detected (1 point)
 * - At least 10 source files (1 point)
 * - Coverage boundaries have known domains (1 point)
 * - Multiple languages detected (1 point, bonus for polyglot projects)
 */
export function scoreScanQuality(profile: ProjectProfile): ScanQualityResult {
  let score = 0;
  const signals: string[] = [];
  const missingSignals: string[] = [];

  // Language detection (1 point)
  if (profile.languages.length > 0) {
    score += 1;
    const primary = profile.languages[0];
    signals.push(`Primary language: ${primary.name} (${primary.percentage}%)`);
  } else {
    missingSignals.push('No programming languages detected');
  }

  // Multiple languages bonus (1 point)
  if (profile.languages.length >= 2) {
    score += 1;
    signals.push(`Polyglot: ${profile.languages.map(l => l.name).join(', ')}`);
  }

  // High-confidence framework (2 points)
  const highConfFrameworks = profile.frameworks.filter(f => f.confidence === 'high');
  if (highConfFrameworks.length > 0) {
    score += 2;
    signals.push(`Frameworks: ${highConfFrameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ''}`).join(', ')}`);
  } else if (profile.frameworks.length > 0) {
    score += 1;
    signals.push(`Possible frameworks: ${profile.frameworks.map(f => f.name).join(', ')} (low confidence)`);
    missingSignals.push('No high-confidence framework detection');
  } else {
    missingSignals.push('No frameworks detected');
  }

  // Structure signals (1 point per, max 2)
  const structureBools = [
    profile.structure.hasApi,
    profile.structure.hasFrontend,
    profile.structure.hasDatabase,
    profile.structure.hasTests,
    profile.structure.hasCICD,
    profile.structure.isMonorepo,
    profile.structure.hasDocker,
  ];
  const structureCount = structureBools.filter(Boolean).length;
  const structurePoints = Math.min(structureCount, 2);
  score += structurePoints;
  if (structureCount > 0) {
    const structureNames: string[] = [];
    if (profile.structure.hasApi) structureNames.push('API');
    if (profile.structure.hasFrontend) structureNames.push('Frontend');
    if (profile.structure.hasDatabase) structureNames.push('Database');
    if (profile.structure.hasTests) structureNames.push('Tests');
    if (profile.structure.hasCICD) structureNames.push('CI/CD');
    if (profile.structure.isMonorepo) structureNames.push('Monorepo');
    if (profile.structure.hasDocker) structureNames.push('Docker');
    signals.push(`Structure: ${structureNames.join(', ')}`);
  } else {
    missingSignals.push('No recognizable project structure');
  }

  // Package manager (1 point)
  if (profile.packageManager !== 'unknown') {
    score += 1;
    signals.push(`Package manager: ${profile.packageManager}`);
  } else {
    missingSignals.push('No package manager detected');
  }

  // Library categories (1 point)
  const libCategories = Object.keys(profile.libraries);
  if (libCategories.length > 0) {
    score += 1;
    const libSummary = libCategories.map(cat => {
      const libs = profile.libraries[cat];
      return `${cat}: ${libs.join(', ')}`;
    }).join('; ');
    signals.push(`Libraries: ${libSummary}`);
  } else {
    missingSignals.push('No library dependencies detected');
  }

  // Source file count (1 point for >= 10 files)
  const totalSourceFiles = profile.languages.reduce((sum, l) => sum + l.fileCount, 0);
  if (totalSourceFiles >= 10) {
    score += 1;
    signals.push(`${totalSourceFiles} source files`);
  } else {
    missingSignals.push(`Only ${totalSourceFiles} source files (need 10+ for structure insight)`);
  }

  // Determine quality tier
  let quality: ScanQuality;
  if (score >= 6) {
    quality = 'rich';
  } else if (score >= 3) {
    quality = 'basic';
  } else {
    quality = 'minimal';
  }

  return { quality, score, signals, missingSignals };
}

// ---------------------------------------------------------------------------
// README / description extraction
// ---------------------------------------------------------------------------

async function extractProjectDescription(dirPath: string): Promise<string | undefined> {
  // Try README first
  for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README.txt', 'README']) {
    try {
      const content = await readFile(path.join(dirPath, name), 'utf-8');
      // Skip badges, links, and images at the top
      const lines = content.split('\n');
      let collecting = false;
      const paragraphLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip title (# heading)
        if (trimmed.startsWith('# ') && !collecting) continue;
        // Skip badges, images, HTML
        if (trimmed.startsWith('![') || trimmed.startsWith('[![') || trimmed.startsWith('<')) continue;
        // Skip empty lines before first paragraph
        if (!trimmed && !collecting) continue;

        if (trimmed) {
          collecting = true;
          paragraphLines.push(trimmed);
        } else if (collecting) {
          // Hit an empty line after collecting — we have our paragraph
          break;
        }
      }

      if (paragraphLines.length > 0) {
        const desc = paragraphLines.join(' ').slice(0, 500);
        return desc;
      }
    } catch {
      continue;
    }
  }

  // Fallback: package.json description
  const pkg = await readJson(path.join(dirPath, 'package.json'));
  if (pkg?.description && typeof pkg.description === 'string') {
    return pkg.description;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Test info detection
// ---------------------------------------------------------------------------

function detectTestInfo(
  files: string[],
  allDeps: Record<string, string>,
): ProjectProfile['testInfo'] {
  const frameworks: string[] = [];
  if (allDeps['vitest']) frameworks.push('Vitest');
  if (allDeps['jest']) frameworks.push('Jest');
  if (allDeps['@jest/core']) frameworks.push('Jest');
  if (allDeps['mocha']) frameworks.push('Mocha');
  if (allDeps['@testing-library/react']) frameworks.push('Testing Library');
  if (allDeps['cypress']) frameworks.push('Cypress');
  if (allDeps['playwright'] || allDeps['@playwright/test']) frameworks.push('Playwright');
  if (allDeps['pytest'] || files.some(f => f.includes('pytest.ini') || f.includes('conftest.py'))) frameworks.push('pytest');

  const testFiles = files.filter(f =>
    /\.(test|spec)\.(ts|tsx|js|jsx|py|rb)$/.test(f) ||
    f.includes('__tests__/') ||
    f.startsWith('tests/') ||
    f.startsWith('test/')
  );

  return { frameworks, fileCount: testFiles.length };
}

// ---------------------------------------------------------------------------
// Entry point detection — find the primary executable/server file
// ---------------------------------------------------------------------------

export async function detectEntryPoint(
  dirPath: string,
  files: string[],
  frameworks: ProjectProfile['frameworks'],
): Promise<string | undefined> {
  const frameworkNames = new Set(frameworks.map(f => f.name));

  // Next.js: app/layout.tsx or pages/_app.tsx
  if (frameworkNames.has('Next.js')) {
    for (const candidate of [
      'app/layout.tsx', 'app/layout.ts', 'app/layout.jsx', 'app/layout.js',
      'src/app/layout.tsx', 'src/app/layout.ts',
      'pages/_app.tsx', 'pages/_app.ts', 'pages/_app.jsx', 'pages/_app.js',
      'src/pages/_app.tsx',
    ]) {
      if (files.includes(candidate)) return candidate;
    }
  }

  // Explicit "main" in package.json
  const pkg = await readJson(path.join(dirPath, 'package.json'));
  if (pkg) {
    // Check scripts.start for the entry
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts?.start) {
      // e.g. "node src/index.js" or "ts-node src/server.ts"
      const startMatch = scripts.start.match(/(?:node|ts-node|tsx|bun)\s+(\S+)/);
      if (startMatch && files.includes(startMatch[1])) return startMatch[1];
    }
    // package.json "main" field
    if (typeof pkg.main === 'string' && files.includes(pkg.main)) return pkg.main;
  }

  // Common entry point patterns (ordered by priority)
  const candidates = [
    'src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx',
    'src/main.ts', 'src/main.tsx', 'src/main.js', 'src/main.jsx',
    'src/app.ts', 'src/app.tsx', 'src/app.js', 'src/app.jsx',
    'src/server.ts', 'src/server.js',
    'index.ts', 'index.js',
    'main.ts', 'main.js', 'main.py',
    'app.ts', 'app.js', 'app.py',
    'server.ts', 'server.js', 'server.py',
    'manage.py',       // Django
    'cmd/main.go',     // Go convention
    'main.go',
    'src/main.rs',     // Rust convention
    'lib/main.dart',   // Flutter convention
    'bin/cli.js', 'bin/cli.ts',
  ];

  for (const candidate of candidates) {
    if (files.includes(candidate)) return candidate;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Synthesis — gaps, stack signals, first topic suggestion
// ---------------------------------------------------------------------------

function synthesize(
  profile: Pick<ProjectProfile, 'languages' | 'frameworks' | 'structure' | 'testInfo' | 'libraries' | 'projectDescription'>,
): ProjectProfile['synthesis'] {
  const gaps: string[] = [];
  const stackSignals: string[] = [];

  // Detect gaps — things you'd typically expect but are missing
  if (!profile.structure.hasTests && (!profile.testInfo || profile.testInfo.fileCount === 0)) {
    gaps.push('No test files or test framework detected');
  }
  if (!profile.structure.hasCICD) {
    gaps.push('No CI/CD configuration detected');
  }
  if (profile.languages.length > 0 && !profile.languages.some(l => l.name === 'TypeScript') &&
      profile.frameworks.some(f => ['Next.js', 'React', 'Vue', 'Svelte', 'Angular'].includes(f.name))) {
    gaps.push('Frontend framework without TypeScript');
  }
  if (profile.structure.hasDatabase && !profile.structure.hasTests) {
    gaps.push('Database layer without tests');
  }
  if (!profile.structure.hasDocker && profile.structure.hasApi) {
    gaps.push('API layer without containerization');
  }

  // Detect notable stack signals
  const frameworkNames = new Set(profile.frameworks.map(f => f.name));
  if (frameworkNames.has('Next.js') && frameworkNames.has('Electron')) {
    stackSignals.push('Desktop app built with Next.js + Electron');
  }
  if (frameworkNames.has('Next.js') && frameworkNames.has('TailwindCSS')) {
    stackSignals.push('Next.js with Tailwind CSS');
  }
  if (profile.structure.isMonorepo) {
    stackSignals.push('Monorepo structure');
  }
  if (frameworkNames.has('MCP')) {
    stackSignals.push('MCP (Model Context Protocol) integration');
  }
  if (profile.languages.length > 2) {
    const topLangs = profile.languages.slice(0, 3).map(l => l.name).join(', ');
    stackSignals.push(`Multi-language project: ${topLangs}`);
  }
  if (profile.structure.hasApi && profile.structure.hasFrontend) {
    stackSignals.push('Full-stack with API and frontend');
  }
  if (Object.keys(profile.libraries).length > 3) {
    stackSignals.push(`Rich dependency surface (${Object.values(profile.libraries).flat().length}+ libraries across ${Object.keys(profile.libraries).length} categories)`);
  }

  // Generate suggested first topic
  let suggestedFirstTopic: string | null = null;
  if (gaps.length > 0 && stackSignals.length > 0) {
    suggestedFirstTopic = `Architecture review: ${stackSignals[0]}${gaps.length > 0 ? ` — noted gap: ${gaps[0].toLowerCase()}` : ''}`;
  } else if (gaps.length > 0) {
    suggestedFirstTopic = `Direction check: ${gaps[0]} — should this be addressed, or is it intentional?`;
  } else if (stackSignals.length > 0) {
    suggestedFirstTopic = `Architecture review: ${stackSignals[0]} — current approach and potential improvements`;
  } else if (profile.languages.length > 0) {
    // Fallback: we know the language but not much else
    const primaryLang = profile.languages[0].name;
    suggestedFirstTopic = `Direction check: Explore this ${primaryLang} project's architecture — what are we building and what matters most?`;
  } else if (profile.projectDescription) {
    // Fallback: we have a README description but not much structure
    suggestedFirstTopic = `Direction check: Review project goals and current architecture — where should effort go next?`;
  } else {
    // Ultimate fallback: scanner found almost nothing
    suggestedFirstTopic = `Direction check: What is this project, what's the current state, and what should we focus on?`;
  }

  return { gaps, stackSignals, suggestedFirstTopic };
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

  const { files, dirs, skippedDirs, truncated } = await walk(dirPath);
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

  // Merge Python libraries if Python is a detected language
  if (languages.some(l => l.name === 'Python')) {
    const pyLibs = await detectPythonLibraries(dirPath, files);
    for (const [category, names] of Object.entries(pyLibs)) {
      if (!libraries[category]) libraries[category] = [];
      for (const name of names) {
        if (!libraries[category].includes(name)) libraries[category].push(name);
      }
    }
  }

  // Detect Go libraries from go.mod
  if (hasFile(files, 'go.mod')) {
    try {
      const goMod = await readFile(path.join(dirPath, 'go.mod'), 'utf-8');
      const goLower = goMod.toLowerCase();
      const goCheck = (cat: string, pkg: string, display: string) => {
        if (goLower.includes(pkg)) {
          if (!libraries[cat]) libraries[cat] = [];
          if (!libraries[cat].includes(display)) libraries[cat].push(display);
        }
      };
      goCheck('api', 'gin-gonic/gin', 'Gin');
      goCheck('api', 'go-chi/chi', 'Chi');
      goCheck('api', 'gorilla/mux', 'Gorilla Mux');
      goCheck('api', 'labstack/echo', 'Echo');
      goCheck('api', 'gofiber/fiber', 'Fiber');
      goCheck('api', 'grpc', 'gRPC');
      goCheck('database', 'gorm.io/gorm', 'GORM');
      goCheck('database', 'jackc/pgx', 'pgx');
      goCheck('database', 'go-redis', 'Redis');
      goCheck('database', 'mongo-driver', 'MongoDB');
      goCheck('testing', 'stretchr/testify', 'Testify');
      goCheck('ai', 'sashabaranov/go-openai', 'OpenAI Go');
      goCheck('monitoring', 'prometheus', 'Prometheus');
      goCheck('monitoring', 'uber-go/zap', 'Zap');
    } catch { /* ignore */ }
  }

  const coverageBoundaries = detectCoverageBoundaries(
    files, dirs, skippedDirs, structure, frameworks, languages, libraries,
  );

  const scanQuality = scoreScanQuality({
    languages,
    frameworks,
    structure,
    packageManager,
    libraries,
    suggestedPreset,
    suggestedAgents,
    coverageBoundaries,
  });

  const projectDescription = await extractProjectDescription(dirPath);
  const testInfo = detectTestInfo(files, allDeps);
  const entryPoint = await detectEntryPoint(dirPath, files, frameworks);
  const synthesis = synthesize({ languages, frameworks, structure, testInfo, libraries, projectDescription });

  return {
    languages,
    frameworks,
    structure,
    packageManager,
    libraries,
    suggestedPreset,
    suggestedAgents,
    scanQuality,
    coverageBoundaries,
    truncated,
    projectDescription,
    testInfo,
    entryPoint,
    synthesis,
  };
}
