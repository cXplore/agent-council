import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import type { CouncilConfig } from '@/lib/types';

// ---------------------------------------------------------------------------
// Platform-safe path helpers
// On Windows, path.join produces backslashes; use path.join for all expected
// path values so tests work on both Windows and Unix.
// ---------------------------------------------------------------------------

// A root that works as an absolute path on both platforms
// path.resolve gives e.g. "C:\abs\workspace" on Windows, "/abs/workspace" on Unix
const W = path.resolve('/abs/workspace');
const P = path.resolve('/abs/projects');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CouncilConfig> = {}): CouncilConfig {
  return {
    projects: {},
    activeProject: 'workspace',
    workspace: {
      agentsDir: path.join(W, 'agents'),
      meetingsDir: path.join(W, 'meetings'),
    },
    port: 3003,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getActiveProjectConfig
// ---------------------------------------------------------------------------

describe('getActiveProjectConfig', () => {
  it('returns workspace config when activeProject is "workspace"', () => {
    const config = makeConfig();
    const result = getActiveProjectConfig(config);

    expect(result.name).toBe('workspace');
    expect(result.agentsDir).toBe(path.join(W, 'agents'));
    expect(result.meetingsDir).toBe(path.join(W, 'meetings'));
    expect(result.projectPath).toBeUndefined();
  });

  it('resolves relative workspace dirs to absolute paths', () => {
    const config = makeConfig({
      workspace: {
        agentsDir: './agents',
        meetingsDir: './meetings',
      },
    });
    const result = getActiveProjectConfig(config);

    // After resolving, should end with 'agents' / 'meetings' and be absolute
    expect(path.isAbsolute(result.agentsDir)).toBe(true);
    expect(path.isAbsolute(result.meetingsDir)).toBe(true);
    expect(result.agentsDir).toMatch(/agents$/);
    expect(result.meetingsDir).toMatch(/meetings$/);
  });

  it('returns active project config when a real project is set', () => {
    const projectPath = path.join(P, 'my-project');
    const config = makeConfig({
      activeProject: 'my-project',
      projects: {
        'my-project': {
          path: projectPath,
          agentsDir: '.claude/agents',
          meetingsDir: 'meetings',
        },
      },
    });
    const result = getActiveProjectConfig(config);

    expect(result.name).toBe('my-project');
    expect(result.projectPath).toBe(projectPath);
    expect(result.agentsDir).toBe(path.join(projectPath, '.claude', 'agents'));
    expect(result.meetingsDir).toBe(path.join(projectPath, 'meetings'));
  });

  it('returns absolute agentsDir/meetingsDir unchanged when project uses absolute paths', () => {
    const projectPath = path.join(P, 'foo');
    const customAgents = path.join(P, 'custom-agents');
    const customMeetings = path.join(P, 'custom-meetings');

    const config = makeConfig({
      activeProject: 'absolute-project',
      projects: {
        'absolute-project': {
          path: projectPath,
          agentsDir: customAgents,
          meetingsDir: customMeetings,
        },
      },
    });
    const result = getActiveProjectConfig(config);

    expect(result.agentsDir).toBe(customAgents);
    expect(result.meetingsDir).toBe(customMeetings);
  });

  it('falls back to workspace when active project is not in projects map', () => {
    const config = makeConfig({
      activeProject: 'ghost-project',
      projects: {},
    });
    const result = getActiveProjectConfig(config);

    expect(result.name).toBe('workspace');
    expect(result.agentsDir).toBe(path.join(W, 'agents'));
    expect(result.meetingsDir).toBe(path.join(W, 'meetings'));
  });

  it('includes projectPath for real projects', () => {
    const projectPath = path.join(P, 'proj');
    const config = makeConfig({
      activeProject: 'proj',
      projects: {
        proj: {
          path: projectPath,
          agentsDir: 'agents',
          meetingsDir: 'meetings',
        },
      },
    });
    const result = getActiveProjectConfig(config);
    expect(result.projectPath).toBe(projectPath);
  });

  it('does not include projectPath for workspace', () => {
    const config = makeConfig();
    const result = getActiveProjectConfig(config);
    expect(result.projectPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getProjectConfig
// ---------------------------------------------------------------------------

describe('getProjectConfig', () => {
  it('returns workspace config when name is "workspace"', () => {
    const config = makeConfig();
    const result = getProjectConfig(config, 'workspace');

    expect(result).not.toBeNull();
    expect(result!.agentsDir).toBe(path.join(W, 'agents'));
    expect(result!.meetingsDir).toBe(path.join(W, 'meetings'));
  });

  it('returns null for unknown project name', () => {
    const config = makeConfig({ projects: {} });
    const result = getProjectConfig(config, 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns config for a known project', () => {
    const projectPath = path.join(P, 'real');
    const config = makeConfig({
      projects: {
        'real-project': {
          path: projectPath,
          agentsDir: '.claude/agents',
          meetingsDir: 'meetings',
        },
      },
    });
    const result = getProjectConfig(config, 'real-project');

    expect(result).not.toBeNull();
    expect(result!.projectPath).toBe(projectPath);
    expect(result!.agentsDir).toBe(path.join(projectPath, '.claude', 'agents'));
    expect(result!.meetingsDir).toBe(path.join(projectPath, 'meetings'));
  });

  it('resolves nested relative meetingsDir relative to project path', () => {
    const projectPath = path.join(P, 'myapp');
    const config = makeConfig({
      projects: {
        proj: {
          path: projectPath,
          agentsDir: 'agents',
          meetingsDir: 'docs/meetings',
        },
      },
    });
    const result = getProjectConfig(config, 'proj');

    expect(result!.meetingsDir).toBe(path.join(projectPath, 'docs', 'meetings'));
    expect(result!.agentsDir).toBe(path.join(projectPath, 'agents'));
  });

  it('handles multiple projects — returns the right one', () => {
    const alphaPath = path.join(P, 'alpha');
    const betaPath = path.join(P, 'beta');
    const config = makeConfig({
      projects: {
        alpha: {
          path: alphaPath,
          agentsDir: '.claude/agents',
          meetingsDir: 'meetings',
        },
        beta: {
          path: betaPath,
          agentsDir: '.claude/agents',
          meetingsDir: 'logs/meetings',
        },
      },
    });

    const alpha = getProjectConfig(config, 'alpha');
    const beta = getProjectConfig(config, 'beta');

    expect(alpha!.projectPath).toBe(alphaPath);
    expect(beta!.projectPath).toBe(betaPath);
    expect(beta!.meetingsDir).toBe(path.join(betaPath, 'logs', 'meetings'));
  });

  it('workspace does not include projectPath', () => {
    const config = makeConfig();
    const result = getProjectConfig(config, 'workspace');
    expect(result!.projectPath).toBeUndefined();
  });
});
