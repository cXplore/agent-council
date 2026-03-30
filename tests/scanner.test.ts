import { describe, it, expect } from 'vitest';
import {
  detectLanguages,
  detectStructure,
  detectPackageManager,
  suggestPreset,
  suggestAgents,
  detectCoverageBoundaries,
  scoreScanQuality,
} from '@/lib/scanner';
import type { ProjectProfile } from '@/lib/types';

// ---------------------------------------------------------------------------
// detectLanguages
// ---------------------------------------------------------------------------

describe('detectLanguages', () => {
  it('returns empty array for no recognized extensions', () => {
    const result = detectLanguages(['README.md', 'LICENSE', '.gitignore', 'Makefile']);
    expect(result).toEqual([]);
  });

  it('counts TypeScript files', () => {
    const files = ['src/index.ts', 'src/utils.tsx', 'src/types.ts', 'lib/foo.ts'];
    const result = detectLanguages(files);
    const ts = result.find(l => l.name === 'TypeScript');
    expect(ts).toBeDefined();
    expect(ts!.fileCount).toBe(4);
    expect(ts!.percentage).toBe(100);
  });

  it('distinguishes TypeScript from JavaScript', () => {
    const files = ['a.ts', 'b.ts', 'c.js', 'd.mjs'];
    const result = detectLanguages(files);
    const ts = result.find(l => l.name === 'TypeScript');
    const js = result.find(l => l.name === 'JavaScript');
    expect(ts!.fileCount).toBe(2);
    expect(js!.fileCount).toBe(2);
  });

  it('sorts languages by file count descending', () => {
    const files = [
      'a.py', 'b.py', 'c.py',      // 3 Python
      'd.ts', 'e.ts',               // 2 TypeScript
      'f.go',                        // 1 Go
    ];
    const result = detectLanguages(files);
    expect(result[0].name).toBe('Python');
    expect(result[1].name).toBe('TypeScript');
    expect(result[2].name).toBe('Go');
  });

  it('calculates percentages that add up correctly', () => {
    const files = ['a.ts', 'b.ts', 'c.py', 'd.py', 'e.py', 'f.py'];
    const result = detectLanguages(files);
    const total = result.reduce((sum, l) => sum + l.percentage, 0);
    // Percentages are rounded, so may not add up to exactly 100, but should be close
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });

  it('handles mixed casing by using lowercased extension check', () => {
    // .R (uppercase) is recognized as R
    const files = ['analysis.R', 'model.r'];
    const result = detectLanguages(files);
    const r = result.find(l => l.name === 'R');
    expect(r).toBeDefined();
    expect(r!.fileCount).toBe(2);
  });

  it('recognizes .tsx as TypeScript', () => {
    const result = detectLanguages(['Component.tsx']);
    expect(result[0].name).toBe('TypeScript');
  });

  it('recognizes .rs as Rust', () => {
    const result = detectLanguages(['main.rs', 'lib.rs']);
    const rust = result.find(l => l.name === 'Rust');
    expect(rust!.fileCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// detectStructure
// ---------------------------------------------------------------------------

type Structure = ProjectProfile['structure'];
type Dirs = Set<string>;

function makeStructure(files: string[], dirs: Dirs): Structure {
  return detectStructure(files, dirs);
}

describe('detectStructure', () => {
  it('detects API from app/api directory', () => {
    const dirs = new Set(['app', 'app/api', 'app/api/users']);
    const result = makeStructure([], dirs);
    expect(result.hasApi).toBe(true);
  });

  it('detects frontend from app .tsx files', () => {
    const files = ['app/page.tsx', 'app/layout.tsx'];
    const result = makeStructure(files, new Set(['app']));
    expect(result.hasFrontend).toBe(true);
  });

  it('detects frontend from src/components', () => {
    const dirs = new Set(['src', 'src/components']);
    const result = makeStructure([], dirs);
    expect(result.hasFrontend).toBe(true);
  });

  it('detects database from prisma directory', () => {
    const dirs = new Set(['prisma']);
    const result = makeStructure([], dirs);
    expect(result.hasDatabase).toBe(true);
  });

  it('detects database from .prisma files', () => {
    const files = ['prisma/schema.prisma'];
    const result = makeStructure(files, new Set(['prisma']));
    expect(result.hasDatabase).toBe(true);
  });

  it('detects tests from tests directory', () => {
    const dirs = new Set(['tests']);
    const result = makeStructure([], dirs);
    expect(result.hasTests).toBe(true);
  });

  it('detects tests from .test.ts files', () => {
    const files = ['src/utils.test.ts', 'src/api.test.ts'];
    const result = makeStructure(files, new Set(['src']));
    expect(result.hasTests).toBe(true);
  });

  it('detects CI/CD from .github/workflows', () => {
    const dirs = new Set(['.github', '.github/workflows']);
    const result = makeStructure([], dirs);
    expect(result.hasCICD).toBe(true);
  });

  it('detects monorepo from packages directory', () => {
    const dirs = new Set(['packages', 'packages/core', 'packages/ui']);
    const result = makeStructure([], dirs);
    expect(result.isMonorepo).toBe(true);
  });

  it('detects monorepo from turbo.json', () => {
    const files = ['turbo.json', 'package.json'];
    const result = makeStructure(files, new Set());
    expect(result.isMonorepo).toBe(true);
  });

  it('detects Docker from Dockerfile', () => {
    const files = ['Dockerfile', 'docker-compose.yml'];
    const result = makeStructure(files, new Set());
    expect(result.hasDocker).toBe(true);
  });

  it('returns all false for empty project', () => {
    const result = makeStructure([], new Set());
    expect(result.hasApi).toBe(false);
    expect(result.hasFrontend).toBe(false);
    expect(result.hasDatabase).toBe(false);
    expect(result.hasTests).toBe(false);
    expect(result.hasCICD).toBe(false);
    expect(result.isMonorepo).toBe(false);
    expect(result.hasDocker).toBe(false);
  });

  it('detects multiple structural features simultaneously', () => {
    const files = ['app/page.tsx', 'Dockerfile', 'turbo.json', 'src/utils.test.ts'];
    const dirs = new Set(['app', 'app/api', 'src', 'prisma', 'packages']);
    const result = makeStructure(files, dirs);
    expect(result.hasFrontend).toBe(true);
    expect(result.hasApi).toBe(true);
    expect(result.hasDatabase).toBe(true);
    expect(result.hasDocker).toBe(true);
    expect(result.isMonorepo).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectPackageManager
// ---------------------------------------------------------------------------

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    expect(detectPackageManager(['pnpm-lock.yaml', 'package.json'])).toBe('pnpm');
  });

  it('detects bun from bun.lockb', () => {
    expect(detectPackageManager(['bun.lockb', 'package.json'])).toBe('bun');
  });

  it('detects bun from bun.lock', () => {
    expect(detectPackageManager(['bun.lock', 'package.json'])).toBe('bun');
  });

  it('detects yarn from yarn.lock', () => {
    expect(detectPackageManager(['yarn.lock', 'package.json'])).toBe('yarn');
  });

  it('detects npm from package-lock.json', () => {
    expect(detectPackageManager(['package-lock.json', 'package.json'])).toBe('npm');
  });

  it('detects pip from requirements.txt', () => {
    expect(detectPackageManager(['requirements.txt', 'main.py'])).toBe('pip');
  });

  it('detects cargo from Cargo.lock', () => {
    expect(detectPackageManager(['Cargo.lock', 'Cargo.toml'])).toBe('cargo');
  });

  it('detects go from go.sum', () => {
    expect(detectPackageManager(['go.sum', 'go.mod'])).toBe('go');
  });

  it('returns unknown for unrecognized project', () => {
    expect(detectPackageManager(['README.md', 'LICENSE'])).toBe('unknown');
  });

  it('pnpm takes priority over yarn when both present', () => {
    // Realistic: pnpm workspaces might have a yarn.lock from legacy
    expect(detectPackageManager(['pnpm-lock.yaml', 'yarn.lock'])).toBe('pnpm');
  });

  it('bun takes priority over npm when both present', () => {
    expect(detectPackageManager(['bun.lockb', 'package-lock.json'])).toBe('bun');
  });

  it('detects lockfiles in nested paths', () => {
    // hasFile checks base name, so nested lockfiles should still be detected
    expect(detectPackageManager(['frontend/pnpm-lock.yaml'])).toBe('pnpm');
  });
});

// ---------------------------------------------------------------------------
// suggestPreset
// ---------------------------------------------------------------------------

function makeStructureObj(overrides: Partial<Structure> = {}): Structure {
  return {
    hasApi: false,
    hasFrontend: false,
    hasDatabase: false,
    hasTests: false,
    hasCICD: false,
    isMonorepo: false,
    hasDocker: false,
    ...overrides,
  };
}

describe('suggestPreset', () => {
  it('suggests full-stack for api + frontend + tests', () => {
    const structure = makeStructureObj({ hasApi: true, hasFrontend: true, hasTests: true });
    expect(suggestPreset(structure, [])).toBe('full-stack');
  });

  it('suggests standard for api without frontend', () => {
    const structure = makeStructureObj({ hasApi: true, hasFrontend: false });
    expect(suggestPreset(structure, [])).toBe('standard');
  });

  it('suggests standard for frontend without api', () => {
    const structure = makeStructureObj({ hasFrontend: true, hasApi: false });
    expect(suggestPreset(structure, [])).toBe('standard');
  });

  it('suggests minimal for small project with few source files', () => {
    const structure = makeStructureObj();
    const languages: ProjectProfile['languages'] = [
      { name: 'TypeScript', fileCount: 5, percentage: 100 },
    ];
    expect(suggestPreset(structure, languages)).toBe('minimal');
  });

  it('suggests standard for medium project without test coverage', () => {
    const structure = makeStructureObj({ hasApi: true, hasFrontend: true, hasTests: false });
    const languages: ProjectProfile['languages'] = [
      { name: 'TypeScript', fileCount: 50, percentage: 100 },
    ];
    expect(suggestPreset(structure, languages)).toBe('standard');
  });

  it('suggests standard for bigger project with no tests', () => {
    const structure = makeStructureObj();
    const languages: ProjectProfile['languages'] = [
      { name: 'TypeScript', fileCount: 100, percentage: 100 },
    ];
    expect(suggestPreset(structure, languages)).toBe('standard');
  });
});

// ---------------------------------------------------------------------------
// suggestAgents
// ---------------------------------------------------------------------------

describe('suggestAgents', () => {
  it('always includes the mandatory triad + developer', () => {
    const structure = makeStructureObj();
    const agents = suggestAgents(structure, []);
    expect(agents).toContain('project-manager');
    expect(agents).toContain('critic');
    expect(agents).toContain('north-star');
    expect(agents).toContain('developer');
  });

  it('adds designer for frontend projects', () => {
    const structure = makeStructureObj({ hasFrontend: true });
    const agents = suggestAgents(structure, []);
    expect(agents).toContain('designer');
  });

  it('adds architect for api or database projects', () => {
    const structure = makeStructureObj({ hasApi: true });
    expect(suggestAgents(structure, [])).toContain('architect');

    const dbStructure = makeStructureObj({ hasDatabase: true });
    expect(suggestAgents(dbStructure, [])).toContain('architect');
  });

  it('adds qa-engineer for projects with tests', () => {
    const structure = makeStructureObj({ hasTests: true });
    expect(suggestAgents(structure, [])).toContain('qa-engineer');
  });

  it('adds devops for CI/CD or Docker projects', () => {
    const ciStructure = makeStructureObj({ hasCICD: true });
    expect(suggestAgents(ciStructure, [])).toContain('devops');

    const dockerStructure = makeStructureObj({ hasDocker: true });
    expect(suggestAgents(dockerStructure, [])).toContain('devops');
  });

  it('adds security-reviewer for api + database projects', () => {
    const structure = makeStructureObj({ hasApi: true, hasDatabase: true });
    expect(suggestAgents(structure, [])).toContain('security-reviewer');
  });

  it('adds tech-writer for api + frontend + tests projects', () => {
    const structure = makeStructureObj({ hasApi: true, hasFrontend: true, hasTests: true });
    expect(suggestAgents(structure, [])).toContain('tech-writer');
  });

  it('does not add tech-writer when tests are missing', () => {
    const structure = makeStructureObj({ hasApi: true, hasFrontend: true, hasTests: false });
    expect(suggestAgents(structure, [])).not.toContain('tech-writer');
  });

  it('adds domain-expert for Terraform infrastructure projects', () => {
    const structure = makeStructureObj();
    const frameworks: ProjectProfile['frameworks'] = [
      { name: 'Terraform', confidence: 'high' },
    ];
    expect(suggestAgents(structure, frameworks)).toContain('domain-expert');
  });

  it('adds domain-expert for .NET projects', () => {
    const structure = makeStructureObj();
    const frameworks: ProjectProfile['frameworks'] = [
      { name: '.NET', confidence: 'high' },
    ];
    expect(suggestAgents(structure, frameworks)).toContain('domain-expert');
  });

  it('does not duplicate agents', () => {
    const structure = makeStructureObj({
      hasApi: true, hasFrontend: true, hasDatabase: true,
      hasTests: true, hasCICD: true,
    });
    const agents = suggestAgents(structure, []);
    const unique = new Set(agents);
    expect(agents.length).toBe(unique.size);
  });

  it('minimal empty project returns only mandatory agents', () => {
    const structure = makeStructureObj();
    const agents = suggestAgents(structure, []);
    expect(agents).toEqual(['project-manager', 'critic', 'north-star', 'developer']);
  });
});

// ---------------------------------------------------------------------------
// detectCoverageBoundaries
// ---------------------------------------------------------------------------

describe('detectCoverageBoundaries', () => {
  const emptyStructure = makeStructureObj();
  const emptyLanguages: ProjectProfile['languages'] = [];
  const emptyFrameworks: ProjectProfile['frameworks'] = [];
  const emptyLibraries: Record<string, string[]> = {};

  it('includes known domains for detected languages above 5%', () => {
    const languages: ProjectProfile['languages'] = [
      { name: 'TypeScript', fileCount: 80, percentage: 80 },
      { name: 'Python', fileCount: 15, percentage: 15 },
      { name: 'Shell', fileCount: 2, percentage: 2 }, // below 5%, excluded
    ];
    const cb = detectCoverageBoundaries(
      [], new Set(), [], emptyStructure, emptyFrameworks, languages, emptyLibraries,
    );
    expect(cb.knownDomains).toContain('TypeScript code patterns');
    expect(cb.knownDomains).toContain('Python code patterns');
    expect(cb.knownDomains).not.toContain('Shell code patterns');
  });

  it('puts high-confidence frameworks in known, others in unknown', () => {
    const frameworks: ProjectProfile['frameworks'] = [
      { name: 'Next.js', confidence: 'high', version: '16.2.1' },
      { name: 'Express', confidence: 'medium' },
    ];
    const cb = detectCoverageBoundaries(
      [], new Set(), [], emptyStructure, frameworks, emptyLanguages, emptyLibraries,
    );
    expect(cb.knownDomains).toContain('Next.js architecture (16.2.1)');
    expect(cb.unknownDomains).toContain('Express (detected but not deeply analyzed)');
  });

  it('adds structure-based known domains', () => {
    const structure = makeStructureObj({
      hasFrontend: true, hasApi: true, hasTests: true, isMonorepo: true,
    });
    const cb = detectCoverageBoundaries(
      [], new Set(), [], structure, emptyFrameworks, emptyLanguages, emptyLibraries,
    );
    expect(cb.knownDomains).toContain('Frontend component structure');
    expect(cb.knownDomains).toContain('API route layout');
    expect(cb.knownDomains).toContain('Test file organization');
    expect(cb.knownDomains).toContain('Monorepo workspace layout');
  });

  it('adds structure-based unknown domains for db, cicd, docker', () => {
    const structure = makeStructureObj({
      hasDatabase: true, hasCICD: true, hasDocker: true,
    });
    const cb = detectCoverageBoundaries(
      [], new Set(), [], structure, emptyFrameworks, emptyLanguages, emptyLibraries,
    );
    expect(cb.unknownDomains.some(d => d.includes('Database schema'))).toBe(true);
    expect(cb.unknownDomains.some(d => d.includes('CI/CD pipeline'))).toBe(true);
    expect(cb.unknownDomains.some(d => d.includes('Container configuration'))).toBe(true);
  });

  it('always includes universal unknowns', () => {
    const cb = detectCoverageBoundaries(
      [], new Set(), [], emptyStructure, emptyFrameworks, emptyLanguages, emptyLibraries,
    );
    expect(cb.unknownDomains.some(d => d.includes('Runtime behavior'))).toBe(true);
    expect(cb.unknownDomains.some(d => d.includes('Business logic'))).toBe(true);
    expect(cb.unknownDomains.some(d => d.includes('External service'))).toBe(true);
    expect(cb.unknownDomains.some(d => d.includes('Git history'))).toBe(true);
  });

  it('tracks scanned and skipped paths', () => {
    const dirs = new Set(['app', 'lib', 'app/api', 'lib/utils']);
    const skipped = ['node_modules', '.git', 'dist'];
    const cb = detectCoverageBoundaries(
      ['app/page.tsx', 'lib/config.ts'], dirs, skipped,
      emptyStructure, emptyFrameworks, emptyLanguages, emptyLibraries,
    );
    // scannedPaths = top-level dirs only
    expect(cb.scannedPaths).toEqual(['app', 'lib']);
    expect(cb.skippedPaths).toEqual(['.git', 'dist', 'node_modules']);
    expect(cb.filesCovered).toBe(2);
  });

  it('notes library categories in unknowns', () => {
    const libraries = { testing: ['vitest'], ui: ['shadcn'], database: ['prisma'] };
    const cb = detectCoverageBoundaries(
      [], new Set(), [], emptyStructure, emptyFrameworks, emptyLanguages, libraries,
    );
    expect(cb.unknownDomains.some(d => d.includes('3 categories detected'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scoreScanQuality
// ---------------------------------------------------------------------------

describe('scoreScanQuality', () => {
  const emptyProfile: ProjectProfile = {
    languages: [],
    frameworks: [],
    structure: { hasApi: false, hasFrontend: false, hasDatabase: false, hasTests: false, hasCICD: false, isMonorepo: false, hasDocker: false },
    packageManager: 'unknown',
    libraries: {},
    suggestedPreset: 'minimal',
    suggestedAgents: [],
  };

  it('returns minimal for an empty scan', () => {
    const result = scoreScanQuality(emptyProfile);
    expect(result.quality).toBe('minimal');
    expect(result.score).toBe(0);
    expect(result.missingSignals.length).toBeGreaterThan(0);
    expect(result.signals.length).toBe(0);
  });

  it('returns rich for a full-stack Next.js project', () => {
    const profile: ProjectProfile = {
      languages: [
        { name: 'TypeScript', fileCount: 80, percentage: 90 },
        { name: 'JavaScript', fileCount: 10, percentage: 10 },
      ],
      frameworks: [
        { name: 'Next.js', confidence: 'high', version: '16.0.0' },
        { name: 'TailwindCSS', confidence: 'high', version: '4.0.0' },
      ],
      structure: { hasApi: true, hasFrontend: true, hasDatabase: true, hasTests: true, hasCICD: false, isMonorepo: false, hasDocker: false },
      packageManager: 'npm',
      libraries: { testing: ['vitest'], ui: ['Radix UI'] },
      suggestedPreset: 'full-stack',
      suggestedAgents: ['developer', 'architect'],
    };
    const result = scoreScanQuality(profile);
    expect(result.quality).toBe('rich');
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('returns basic for a project with only language and package manager', () => {
    const profile: ProjectProfile = {
      ...emptyProfile,
      languages: [{ name: 'Python', fileCount: 15, percentage: 100 }],
      packageManager: 'pip',
    };
    const result = scoreScanQuality(profile);
    expect(result.quality).toBe('basic');
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.score).toBeLessThan(6);
  });

  it('awards 2 points for high-confidence frameworks', () => {
    const withHigh: ProjectProfile = {
      ...emptyProfile,
      frameworks: [{ name: 'Next.js', confidence: 'high' }],
    };
    const withMedium: ProjectProfile = {
      ...emptyProfile,
      frameworks: [{ name: 'FastAPI', confidence: 'medium' }],
    };
    const highResult = scoreScanQuality(withHigh);
    const medResult = scoreScanQuality(withMedium);
    expect(highResult.score).toBeGreaterThan(medResult.score);
  });

  it('caps structure points at 2', () => {
    const manyStructure: ProjectProfile = {
      ...emptyProfile,
      structure: { hasApi: true, hasFrontend: true, hasDatabase: true, hasTests: true, hasCICD: true, isMonorepo: true, hasDocker: true },
    };
    const twoStructure: ProjectProfile = {
      ...emptyProfile,
      structure: { hasApi: true, hasFrontend: true, hasDatabase: false, hasTests: false, hasCICD: false, isMonorepo: false, hasDocker: false },
    };
    const many = scoreScanQuality(manyStructure);
    const two = scoreScanQuality(twoStructure);
    // Both should get exactly 2 structure points (signals differ but score is same for structure)
    expect(many.score).toBe(two.score);
  });

  it('gives polyglot bonus for multiple languages', () => {
    const single: ProjectProfile = {
      ...emptyProfile,
      languages: [{ name: 'TypeScript', fileCount: 20, percentage: 100 }],
    };
    const multi: ProjectProfile = {
      ...emptyProfile,
      languages: [
        { name: 'TypeScript', fileCount: 15, percentage: 75 },
        { name: 'Python', fileCount: 5, percentage: 25 },
      ],
    };
    expect(scoreScanQuality(multi).score).toBeGreaterThan(scoreScanQuality(single).score);
  });

  it('requires 10+ source files for file count point', () => {
    const few: ProjectProfile = {
      ...emptyProfile,
      languages: [{ name: 'TypeScript', fileCount: 5, percentage: 100 }],
    };
    const many: ProjectProfile = {
      ...emptyProfile,
      languages: [{ name: 'TypeScript', fileCount: 15, percentage: 100 }],
    };
    expect(scoreScanQuality(many).score).toBeGreaterThan(scoreScanQuality(few).score);
  });
});
