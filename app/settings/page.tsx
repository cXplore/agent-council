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
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<{ name: string; path: string }[]>([]);
  const [llmStatus, setLlmStatus] = useState<{ available: boolean; backend: string; providers: Record<string, boolean> } | null>(null);
  const [usageSettings, setUsageSettings] = useState<{ profile: string; defaultRounds: number; maxTokens: number; defaultModel?: string } | null>(null);
  const [usageSaving, setUsageSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Settings — Agent Council'; }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(r => r.ok ? r.json() : null),
      fetch('/api/setup/mcp').then(r => r.ok ? r.json() : null),
      fetch('/api/agents/check').then(r => r.ok ? r.json() : null),
      fetch('/api/projects').then(r => r.ok ? r.json() : null),
      fetch('/api/council/llm-status').then(r => r.ok ? r.json() : null),
      fetch('/api/settings/usage').then(r => r.ok ? r.json() : null),
    ]).then(([h, m, tc, p, llm, usage]) => {
      setHealth(h);
      setMcp(m);
      setTemplateCheck(tc);
      if (p?.projects) setProjectList(p.projects);
      setLlmStatus(llm);
      setUsageSettings(usage);
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

          {/* AI Providers */}
          {llmStatus && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>AI Providers</h2>
                <span className="text-xs" style={{ color: llmStatus.available ? 'var(--live-green)' : 'var(--text-muted)' }}>
                  {llmStatus.available ? 'ready' : 'no providers configured'}
                </span>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'anthropic', label: 'Anthropic', env: 'ANTHROPIC_API_KEY', models: 'Claude Opus, Sonnet, Haiku' },
                  { key: 'openai', label: 'OpenAI', env: 'OPENAI_API_KEY', models: 'GPT-5.4, GPT-4o' },
                  { key: 'google', label: 'Google', env: 'GOOGLE_GENERATIVE_AI_API_KEY', models: 'Gemini 2.5 Pro' },
                  { key: 'agent-sdk', label: 'Claude Code', env: 'CLAUDE_CODE_OAUTH_TOKEN', models: 'Via Claude subscription' },
                ].map(provider => {
                  const active = llmStatus.providers[provider.key] ?? false;
                  return (
                    <div key={provider.key} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'var(--live-green)' : 'var(--border)' }} />
                        <span className="text-sm" style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {provider.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {provider.models}
                        </span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: active ? 'var(--live-green)' : 'var(--text-muted)', opacity: 0.7 }}>
                        {active ? 'configured' : provider.env}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                Add API keys to <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', fontFamily: 'var(--font-mono)' }}>.env.local</code> to enable providers.
                Each agent can use a different provider — set <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', fontFamily: 'var(--font-mono)' }}>model: openai/gpt-5.4</code> in agent frontmatter.
              </p>
            </motion.div>
          )}

          {/* Usage Profile */}
          {usageSettings && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Usage Profile</h2>
              {/* Profile selector */}
              <div className="flex gap-2 mb-4">
                {(['lean', 'standard', 'deep'] as const).map(profile => {
                  const isActive = usageSettings.profile === profile;
                  const labels = { lean: 'Lean', standard: 'Standard', deep: 'Deep' };
                  const descriptions = { lean: '1 round · shorter responses · cheaper models', standard: '2 rounds · balanced · default', deep: '3 rounds · thorough · best models' };
                  return (
                    <button
                      key={profile}
                      disabled={usageSaving}
                      onClick={async () => {
                        setUsageSaving(true);
                        try {
                          const res = await fetch('/api/settings/usage', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ profile }),
                          });
                          if (res.ok) setUsageSettings(await res.json());
                        } catch { /* ignore */ }
                        finally { setUsageSaving(false); }
                      }}
                      className="flex-1 rounded-lg p-3 text-left transition-colors"
                      style={{
                        background: isActive ? 'var(--accent-muted)' : 'var(--bg)',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <div className="text-sm font-medium" style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {labels[profile]}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {descriptions[profile]}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Fine-tuning */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs block mb-1.5" style={{ color: 'var(--text-muted)' }}>Default rounds</label>
                  <div className="flex gap-1">
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        disabled={usageSaving}
                        onClick={async () => {
                          setUsageSaving(true);
                          try {
                            const res = await fetch('/api/settings/usage', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ defaultRounds: n }),
                            });
                            if (res.ok) setUsageSettings(await res.json());
                          } catch { /* ignore */ }
                          finally { setUsageSaving(false); }
                        }}
                        className="w-8 h-8 rounded text-sm transition-colors"
                        style={{
                          background: usageSettings.defaultRounds === n ? 'var(--accent-muted)' : 'var(--bg)',
                          color: usageSettings.defaultRounds === n ? 'var(--accent)' : 'var(--text-muted)',
                          border: `1px solid ${usageSettings.defaultRounds === n ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs block mb-1.5" style={{ color: 'var(--text-muted)' }}>Max tokens per response</label>
                  <select
                    disabled={usageSaving}
                    value={usageSettings.maxTokens}
                    onChange={async (e) => {
                      const maxTokens = parseInt(e.target.value);
                      setUsageSaving(true);
                      try {
                        const res = await fetch('/api/settings/usage', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ maxTokens }),
                        });
                        if (res.ok) setUsageSettings(await res.json());
                      } catch { /* ignore */ }
                      finally { setUsageSaving(false); }
                    }}
                    className="text-sm px-3 py-1.5 rounded outline-none w-full"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="1024">1,024 — brief</option>
                    <option value="2048">2,048 — lean</option>
                    <option value="4096">4,096 — standard</option>
                    <option value="8192">8,192 — thorough</option>
                    <option value="16384">16,384 — deep</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs block mb-1.5" style={{ color: 'var(--text-muted)' }}>Default model override</label>
                  <input
                    type="text"
                    disabled={usageSaving}
                    value={usageSettings.defaultModel ?? ''}
                    placeholder="e.g. anthropic/claude-sonnet-4.6"
                    onChange={async (e) => {
                      const defaultModel = e.target.value || undefined;
                      setUsageSettings(prev => prev ? { ...prev, defaultModel: defaultModel ?? undefined } : prev);
                    }}
                    onBlur={async (e) => {
                      const defaultModel = e.target.value.trim() || undefined;
                      setUsageSaving(true);
                      try {
                        const res = await fetch('/api/settings/usage', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ defaultModel: defaultModel ?? null }),
                        });
                        if (res.ok) setUsageSettings(await res.json());
                      } catch { /* ignore */ }
                      finally { setUsageSaving(false); }
                    }}
                    className="text-sm px-3 py-1.5 rounded outline-none w-full"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                    Overrides all agent models. Leave empty to use per-agent settings. Format: provider/model
                  </p>
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                Profile sets defaults. You can override rounds per-meeting in the Run meeting form.
              </p>
            </motion.div>
          )}

          {/* Projects */}
          {health && (
            <motion.div {...staggerFadeUp(sectionIndex++)}
              className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Projects</h2>
                <a href="/setup" className="text-xs" style={{ color: 'var(--accent)' }}>+ Connect</a>
              </div>
              {projectList.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No projects connected. <a href="/setup" style={{ color: 'var(--accent)' }}>Connect one →</a></p>
              ) : (
                <div className="space-y-2">
                  {projectList.map(project => (
                    <div
                      key={project.name}
                      className="flex items-center justify-between py-2 px-3 rounded text-xs"
                      style={{ background: 'var(--bg)' }}
                    >
                      <div>
                        <span className="font-medium" style={{ color: health.activeProject === project.name ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {project.name}
                        </span>
                        {health.activeProject === project.name && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>active</span>
                        )}
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                          {project.path}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm(`Disconnect "${project.name}" from Agent Council? This won't delete any files.`)) return;
                          await fetch('/api/projects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'remove', name: project.name }),
                          });
                          window.location.reload();
                        }}
                        className="text-xs px-2 py-0.5 rounded transition-colors hover:brightness-125"
                        style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                  <div className="flex items-center justify-between">
                    <span>
                      {staleAgents.length} agent{staleAgents.length !== 1 ? 's' : ''} have newer template content available.
                      Your model and team settings will be preserved.
                    </span>
                    <button
                      onClick={async () => {
                        setMergeStatus('merging');
                        try {
                          const res = await fetch('/api/agents/merge', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ agents: staleAgents.map(a => a.filename) }),
                          });
                          const data = await res.json();
                          if (data.merged?.length > 0) {
                            setMergeStatus(`Updated ${data.merged.length} agent${data.merged.length !== 1 ? 's' : ''}`);
                            // Refresh template check
                            fetch('/api/agents/check').then(r => r.json()).then(setTemplateCheck).catch(() => {});
                          } else {
                            setMergeStatus('No changes needed');
                          }
                        } catch {
                          setMergeStatus('Update failed');
                        }
                        setTimeout(() => setMergeStatus(null), 3000);
                      }}
                      className="text-xs px-3 py-1 rounded flex-shrink-0 ml-3"
                      style={{
                        background: mergeStatus === 'merging' ? 'var(--bg)' : 'rgba(59, 130, 246, 0.15)',
                        color: mergeStatus && mergeStatus !== 'merging' ? 'var(--live-green)' : 'var(--accent)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                      }}
                      disabled={mergeStatus === 'merging'}
                    >
                      {mergeStatus === 'merging' ? 'Updating...' : mergeStatus ?? 'Update all'}
                    </button>
                  </div>
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
