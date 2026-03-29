'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'motion/react';

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

interface AgentCheck {
  name: string;
  filename: string;
  templateMatch: boolean;
  upToDate: boolean | null;
  templateHash: string | null;
  agentHash: string;
}

interface AgentCheckResponse {
  agents: AgentCheck[];
  project: string;
  error?: string;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22 },
};

function staggerFadeUp(i: number) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, delay: i * 0.07 },
  };
}

function SettingsInner() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [templateCheck, setTemplateCheck] = useState<AgentCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(r => r.ok ? r.json() : null),
      fetch('/api/setup/mcp').then(r => r.ok ? r.json() : null),
      fetch('/api/agents/check').then(r => r.ok ? r.json() : null),
    ]).then(([h, m, tc]) => {
      setHealth(h);
      setMcp(m);
      setTemplateCheck(tc);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="loading-shimmer h-7 w-28 rounded mb-2" />
          <div className="loading-shimmer h-4 w-52 rounded mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="loading-shimmer h-4 w-24 rounded mb-3" />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map(j => (
                    <div key={j}>
                      <div className="loading-shimmer h-3 w-16 rounded mb-1.5" />
                      <div className="loading-shimmer h-5 w-12 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const staleAgents = templateCheck?.agents.filter(a => a.templateMatch && !a.upToDate) ?? [];
  const mcpFullyConfigured = mcp ? Object.values(mcp.targets).every(t => t.configured) : false;

  let sectionIndex = 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <motion.div {...fadeUp}>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Application status and configuration
          </p>
        </motion.div>

        <div className="space-y-4">
          {/* Server Status */}
          {health && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Server</h2>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: health.status === 'ok' ? 'var(--live-green)' : 'var(--error)' }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${health.status === 'ok' ? 'animate-pulse' : ''}`}
                    style={{ background: 'currentColor' }} />
                  {health.status === 'ok' ? 'running' : health.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Version</div>
                  <div className="mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>{health.version}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Uptime</div>
                  <div className="mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>{formatUptime(health.uptime)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Platform</div>
                  <div className="mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>{health.platform}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Node</div>
                  <div className="mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>{health.node}</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Projects */}
          {health && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Projects</h2>
              <div className="grid grid-cols-3 gap-4 text-xs mb-3">
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Connected</div>
                  <div className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{health.projects.total}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Accessible</div>
                  <div className="text-2xl font-semibold mt-1" style={{ color: 'var(--live-green)' }}>{health.projects.accessible}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Missing</div>
                  <div className="text-2xl font-semibold mt-1"
                    style={{ color: health.projects.missing > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                    {health.projects.missing}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Active: <strong style={{ color: 'var(--text-primary)' }}>{health.activeProject || '—'}</strong>
                </span>
                <a href="/setup" className="text-xs" style={{ color: 'var(--accent)' }}>Manage projects →</a>
              </div>
            </motion.div>
          )}

          {/* MCP Status */}
          {mcp && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>MCP Server</h2>
                {!mcpFullyConfigured && (
                  <a href="/setup" className="text-xs" style={{ color: 'var(--accent)' }}>Configure →</a>
                )}
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: mcp.serverExists ? 'var(--live-green)' : 'var(--error)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Server file {mcp.serverExists ? 'found' : 'missing'}
                  </span>
                  {mcp.serverExists && (
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                      {mcp.serverPath.split(/[/\\]/).slice(-2).join('/')}
                    </span>
                  )}
                </div>
                {Object.entries(mcp.targets).map(([key, target]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: target.configured ? 'var(--live-green)' : target.exists ? 'var(--warning)' : 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {key === 'claudeCode' ? 'Claude Code CLI' : 'Claude Desktop'}:
                      {' '}{target.configured ? 'configured' : target.exists ? 'not configured' : 'config not found'}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Template Status */}
          {templateCheck && templateCheck.agents.length > 0 && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Template Status</h2>
                {staleAgents.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.3)' }}>
                    {staleAgents.length} outdated
                  </span>
                )}
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Compares project agents against built-in templates
                {templateCheck.project ? ` for ${templateCheck.project}` : ''}
              </p>
              <div className="space-y-1.5">
                {templateCheck.agents.map((agent) => (
                  <div
                    key={agent.filename}
                    className="flex items-center justify-between py-1.5 px-2 rounded text-xs"
                    style={{ background: 'var(--bg)' }}
                  >
                    <div className="flex items-center gap-2">
                      {agent.templateMatch ? (
                        agent.upToDate ? (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--live-green)' }} />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--warning)' }} />
                        )
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--text-muted)' }} />
                      )}
                      <span style={{ color: 'var(--text-primary)' }}>{agent.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>{agent.filename}</span>
                    </div>
                    <div>
                      {agent.templateMatch ? (
                        agent.upToDate ? (
                          <span style={{ color: 'var(--text-muted)' }}>up to date</span>
                        ) : (
                          <span style={{ color: 'var(--warning)' }}>template updated</span>
                        )
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>custom</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {staleAgents.length > 0 && (
                <div className="mt-3 pt-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {staleAgents.length} agent{staleAgents.length !== 1 ? 's' : ''} were generated from templates that have since been updated.
                  {' '}Regenerate them from the{' '}
                  <a href="/agents" style={{ color: 'var(--accent)' }}>agents page</a>
                  {' '}to get the latest instructions.
                </div>
              )}
            </motion.div>
          )}

          {/* Keyboard Shortcuts */}
          <motion.div {...staggerFadeUp(sectionIndex++)}
            className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { keys: 'Ctrl+K', desc: 'Open command palette' },
                { keys: 'j / k', desc: 'Navigate meeting list' },
                { keys: 'Enter', desc: 'Select focused meeting' },
                { keys: 'Escape', desc: 'Back to list / close' },
                { keys: 'Ctrl+F', desc: 'Search within meeting' },
              ].map(s => (
                <div key={s.keys} className="flex items-center gap-3">
                  <kbd className="px-2 py-0.5 rounded font-mono text-xs flex-shrink-0"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: 72, textAlign: 'center' }}>
                    {s.keys}
                  </kbd>
                  <span style={{ color: 'var(--text-muted)' }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Links */}
          <motion.div {...staggerFadeUp(sectionIndex++)}
            className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Quick Links</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <a href="/guide" style={{ color: 'var(--accent)' }}>Getting Started Guide</a>
              <a href="/api/health" style={{ color: 'var(--accent)' }}>Health API</a>
              <a href="/api/meetings/export" style={{ color: 'var(--accent)' }}>Export all (JSON)</a>
              <a href="/api/meetings/feed" style={{ color: 'var(--text-muted)' }}>RSS Feed</a>
            </div>
          </motion.div>
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
