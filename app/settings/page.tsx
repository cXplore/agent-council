'use client';

import { useState, useEffect, Suspense } from 'react';

interface HealthData {
  status: string;
  version: string;
  uptime: number;
  activeProject: string;
  projects: { total: number; accessible: number; missing: number };
  node: string;
  platform: string;
}

interface McpStatus {
  serverPath: string;
  serverExists: boolean;
  targets: Record<string, { exists: boolean; configured: boolean; path: string }>;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function SettingsInner() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(r => r.ok ? r.json() : null),
      fetch('/api/setup/mcp').then(r => r.ok ? r.json() : null),
    ]).then(([h, m]) => {
      setHealth(h);
      setMcp(m);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="loading-shimmer h-4 w-32 rounded mb-2" />
                <div className="loading-shimmer h-3 w-48 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Application status and configuration
        </p>

        <div className="space-y-6">
          {/* Server Status */}
          {health && (
            <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Server</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: health.status === 'ok' ? 'var(--live-green)' : 'var(--error)' }} />
                    <span style={{ color: 'var(--text-primary)' }}>{health.status}</span>
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Version</span>
                  <div className="mt-1" style={{ color: 'var(--text-primary)' }}>{health.version}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Uptime</span>
                  <div className="mt-1" style={{ color: 'var(--text-primary)' }}>{formatUptime(health.uptime)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Platform</span>
                  <div className="mt-1" style={{ color: 'var(--text-primary)' }}>{health.platform} / Node {health.node}</div>
                </div>
              </div>
            </div>
          )}

          {/* Projects */}
          {health && (
            <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Projects</h2>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Connected</span>
                  <div className="text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{health.projects.total}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Accessible</span>
                  <div className="text-lg font-semibold mt-1" style={{ color: 'var(--live-green)' }}>{health.projects.accessible}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Missing</span>
                  <div className="text-lg font-semibold mt-1" style={{ color: health.projects.missing > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{health.projects.missing}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Active: <strong style={{ color: 'var(--text-primary)' }}>{health.activeProject}</strong></span>
                <a href="/setup" className="text-xs" style={{ color: 'var(--accent)' }}>Manage projects</a>
              </div>
            </div>
          )}

          {/* MCP Status */}
          {mcp && (
            <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>MCP Server</h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: mcp.serverExists ? 'var(--live-green)' : 'var(--error)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Server file {mcp.serverExists ? 'found' : 'missing'}</span>
                </div>
                {Object.entries(mcp.targets).map(([key, target]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: target.configured ? 'var(--live-green)' : target.exists ? 'var(--warning)' : 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {key === 'claudeCode' ? 'Claude Code CLI' : 'Claude Desktop'}:
                      {target.configured ? ' configured' : target.exists ? ' not configured' : ' config file not found'}
                    </span>
                  </div>
                ))}
              </div>
              {!Object.values(mcp.targets).every(t => t.configured) && (
                <a href="/setup" className="text-xs mt-3 inline-block" style={{ color: 'var(--accent)' }}>Configure MCP</a>
              )}
            </div>
          )}

          {/* Keyboard Shortcuts */}
          <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
            <div className="space-y-2 text-xs">
              {[
                { keys: 'Ctrl+K', desc: 'Open command palette' },
                { keys: 'j / k', desc: 'Navigate meeting list' },
                { keys: 'Enter', desc: 'Select focused meeting' },
                { keys: 'Escape', desc: 'Back to list / close' },
                { keys: 'Ctrl+F', desc: 'Search within meeting' },
              ].map(s => (
                <div key={s.keys} className="flex items-center gap-3">
                  <kbd className="px-2 py-0.5 rounded font-mono" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: 80, textAlign: 'center' }}>
                    {s.keys}
                  </kbd>
                  <span style={{ color: 'var(--text-muted)' }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Links</h2>
            <div className="flex flex-wrap gap-4 text-xs">
              <a href="/api/health" className="underline" style={{ color: 'var(--accent)' }}>Health API</a>
              <a href="/api/meetings/feed" className="underline" style={{ color: 'var(--accent)' }}>RSS Feed</a>
              <a href="/api/meetings/export" className="underline" style={{ color: 'var(--accent)' }}>Export (JSON)</a>
              <a href="/guide" className="underline" style={{ color: 'var(--accent)' }}>Guide</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <SettingsInner />
    </Suspense>
  );
}
