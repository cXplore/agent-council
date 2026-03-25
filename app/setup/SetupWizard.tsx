'use client';

import { useState } from 'react';
import type { ProjectProfile } from '@/lib/types';

type Step = 'choose' | 'connect' | 'path' | 'scan' | 'customize' | 'generate';

interface AgentSelection {
  template: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
  enabled: boolean;
}

const DEFAULT_TOOLS = ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Bash'];
const MODEL_OPTIONS = ['opus', 'sonnet', 'haiku'];

const ALL_AGENTS: Record<string, { description: string; defaultModel: string }> = {
  'facilitator': { description: 'Chief of Staff — runs structured meetings', defaultModel: 'opus' },
  'project-manager': { description: 'Tracks project state, provides grounding', defaultModel: 'sonnet' },
  'critic': { description: 'Challenges assumptions, prevents groupthink', defaultModel: 'opus' },
  'north-star': { description: 'Advocates for impact and possibility', defaultModel: 'opus' },
  'developer': { description: 'Core engineer — writes and reviews code', defaultModel: 'sonnet' },
  'architect': { description: 'System design, patterns, trade-offs', defaultModel: 'opus' },
  'designer': { description: 'UI/UX, accessibility, user flows', defaultModel: 'sonnet' },
  'qa-engineer': { description: 'Testing strategy, edge cases, quality', defaultModel: 'sonnet' },
  'security-reviewer': { description: 'Security audits, auth, vulnerabilities', defaultModel: 'sonnet' },
  'devops': { description: 'CI/CD, deployment, infrastructure', defaultModel: 'sonnet' },
  'tech-writer': { description: 'Documentation, API docs, clarity', defaultModel: 'sonnet' },
  'domain-expert': { description: 'Custom domain knowledge specialist', defaultModel: 'sonnet' },
};

export default function SetupWizard() {
  const [step, setStep] = useState<Step>('choose');
  const [projectPath, setProjectPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [agents, setAgents] = useState<AgentSelection[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectInfo, setConnectInfo] = useState<{ hasAgents: boolean; agentCount: number; hasFacilitator: boolean } | null>(null);

  const handleConnect = async () => {
    if (!projectPath.trim()) return;
    setConnecting(true);
    setConnectError('');

    try {
      // Try to update the config with this project's meetings dir
      const res = await fetch('/api/setup/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not access project');
      }

      // Check for common meeting directory locations
      const meetingsDirs = [
        'meetings', 'docs/meetings', 'docs/10-meetings',
        '.meetings', 'meeting-notes', 'docs/meeting-notes',
      ];

      // Try to find the meetings directory
      let foundMeetingsDir = null;
      for (const dir of meetingsDirs) {
        try {
          const checkRes = await fetch('/api/setup/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: `${projectPath.trim()}/${dir}` }),
          });
          if (checkRes.ok) {
            foundMeetingsDir = dir;
            break;
          }
        } catch {
          // continue
        }
      }

      // If no meetings dir found, we'll create one
      if (!foundMeetingsDir) {
        foundMeetingsDir = 'meetings';
      }

      // Save the config and get agent info
      const connectData = await fetch('/api/setup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: projectPath.trim(),
          meetingsDir: foundMeetingsDir,
        }),
      }).then(r => r.json());

      const agentCount = connectData.agentCount ?? 0;
      setConnectInfo({
        hasAgents: agentCount > 0,
        agentCount,
        hasFacilitator: connectData.hasFacilitator ?? false,
      });
      setConnected(true);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleScan = async () => {
    if (!projectPath.trim()) return;
    setScanning(true);
    setScanError('');

    try {
      const res = await fetch('/api/setup/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Scan failed');
      }

      const data: ProjectProfile = await res.json();
      setProfile(data);

      // Build agent selections from suggested agents
      const selections: AgentSelection[] = [];

      // Always include facilitator
      if (!data.suggestedAgents.includes('facilitator')) {
        data.suggestedAgents.unshift('facilitator');
      }

      for (const [template, info] of Object.entries(ALL_AGENTS)) {
        selections.push({
          template,
          name: template,
          description: info.description,
          model: info.defaultModel,
          tools: [...DEFAULT_TOOLS],
          enabled: data.suggestedAgents.includes(template),
        });
      }

      setAgents(selections);
      setStep('scan');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleSkipToDefaults = () => {
    const selections: AgentSelection[] = [];
    for (const [template, info] of Object.entries(ALL_AGENTS)) {
      selections.push({
        template,
        name: template,
        description: info.description,
        model: info.defaultModel,
        tools: [...DEFAULT_TOOLS],
        enabled: ['facilitator', 'project-manager', 'critic', 'north-star', 'developer'].includes(template),
      });
    }
    setAgents(selections);
    setStep('customize');
  };

  const toggleAgent = (index: number) => {
    setAgents(prev => prev.map((a, i) =>
      i === index ? { ...a, enabled: !a.enabled } : a
    ));
  };

  const updateAgent = (index: number, field: keyof AgentSelection, value: string) => {
    setAgents(prev => prev.map((a, i) =>
      i === index ? { ...a, [field]: value } : a
    ));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const enabledAgents = agents.filter(a => a.enabled);
      const targetDir = projectPath.trim() || '.';

      const res = await fetch('/api/setup/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDir,
          agents: enabledAgents.map(a => ({
            name: a.name,
            template: a.template,
            model: a.model,
            description: a.description,
          })),
          projectProfile: profile,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedFiles(data.files || []);
      setStep('generate');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const enabledCount = agents.filter(a => a.enabled).length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {step === 'choose' ? 'Connect Your Project' : step === 'connect' ? 'Connect Project' : 'Set Up Your Agent Team'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {step === 'choose' && 'Already have agents? Just connect. Need agents? We\'ll set them up.'}
            {step === 'connect' && 'Point us at your project. We\'ll find the meetings directory.'}
            {step === 'path' && 'Point us at your project and we\'ll suggest a team.'}
            {step === 'scan' && 'Here\'s what we found. Review the suggested team.'}
            {step === 'customize' && 'Customize your agents before generating.'}
            {step === 'generate' && 'Your agents are ready.'}
          </p>
        </div>

        {/* Step indicator — only for setup flow */}
        {!['choose', 'connect'].includes(step) && (
          <div className="flex gap-2 mb-8">
            {(['path', 'scan', 'customize', 'generate'] as Step[]).map((s, i) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full"
                style={{
                  background: i <= ['path', 'scan', 'customize', 'generate'].indexOf(step)
                    ? 'var(--accent)'
                    : 'var(--border)',
                }}
              />
            ))}
          </div>
        )}

        {/* Step: Choose path */}
        {step === 'choose' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('connect')}
              className="w-full text-left rounded-lg p-6 transition-colors hover:brightness-110"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
            >
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--accent)' }}>
                I have a project with agents
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Connect your project to the meeting viewer. Your existing <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>.claude/agents/</code> files will be used as-is.
              </p>
            </button>

            <button
              onClick={() => setStep('path')}
              className="w-full text-left rounded-lg p-6 transition-colors hover:brightness-110"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                I need to set up agents
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Scan your codebase and generate a team of agents. Or start with generic defaults.
              </p>
            </button>

            <button
              onClick={handleSkipToDefaults}
              className="w-full text-left rounded-lg p-6 transition-colors hover:brightness-110"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                Just exploring
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Skip setup and use generic defaults. You can customize later.
              </p>
            </button>
          </div>
        )}

        {/* Step: Connect existing project */}
        {step === 'connect' && (
          <div className="space-y-6">
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Project directory
              </label>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                placeholder="C:\Projects\my-app or /home/user/my-app"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                We&apos;ll find your meetings directory and configure the viewer to watch it.
              </p>
              {connectError && (
                <p className="text-sm mt-2" style={{ color: 'var(--error)' }}>{connectError}</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleConnect}
                  disabled={!projectPath.trim() || connecting}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  onClick={() => setStep('choose')}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Back
                </button>
              </div>
            </div>

            {connected && (
              <div
                className="rounded-lg p-6"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Connected</h3>
                </div>
                {connectInfo && (
                  <div className="text-sm space-y-2 mb-4" style={{ color: 'var(--text-secondary)' }}>
                    {connectInfo.hasAgents ? (
                      <p>
                        Found <strong style={{ color: 'var(--text-primary)' }}>{connectInfo.agentCount} agents</strong> in your project.
                        {connectInfo.hasFacilitator
                          ? <span style={{ color: 'var(--success)' }}> Facilitator detected — meetings are ready.</span>
                          : <span style={{ color: 'var(--warning)' }}> No facilitator found — you&apos;ll need one to run meetings. <a href="/setup" onClick={(e) => { e.preventDefault(); setStep('path'); }} className="underline" style={{ color: 'var(--accent)' }}>Generate agents</a></span>
                        }
                      </p>
                    ) : (
                      <p style={{ color: 'var(--warning)' }}>
                        No agents found in <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>.claude/agents/</code>. You&apos;ll need to set up a team before running meetings. <a href="/setup" onClick={(e) => { e.preventDefault(); setStep('path'); }} className="underline" style={{ color: 'var(--accent)' }}>Set up agents</a>
                      </p>
                    )}
                    <p>The meeting viewer is now watching your project&apos;s meetings directory.</p>
                  </div>
                )}
                <a
                  href="/meetings"
                  className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  Open Meeting Viewer
                </a>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Project Path */}
        {step === 'path' && (
          <div className="space-y-6">
            {/* Explainer for newcomers */}
            <div
              className="rounded-lg p-5 text-sm leading-relaxed"
              style={{ background: 'var(--accent-muted)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>What are agents?</strong> Claude Code can use specialized agents — markdown files in your project&apos;s <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>.claude/agents/</code> folder. Each agent has a role (developer, critic, architect) and personality. They can participate in structured meetings where they deliberate on your project&apos;s direction.
            </div>

            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Project directory
              </label>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
                placeholder="C:\Projects\my-app or /home/user/my-app"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              {scanError && (
                <p className="text-sm mt-2" style={{ color: 'var(--error)' }}>{scanError}</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleScan}
                  disabled={!projectPath.trim() || scanning}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {scanning ? 'Scanning...' : 'Scan Project'}
                </button>
                <button
                  onClick={handleSkipToDefaults}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  No project — use generic defaults
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Scan Results */}
        {step === 'scan' && profile && (
          <div className="space-y-6">
            {/* Detected info */}
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                Project Profile
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Languages:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {profile.languages.slice(0, 5).map(l => (
                      <span
                        key={l.name}
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                      >
                        {l.name} ({l.percentage}%)
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Frameworks:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {profile.frameworks.map(f => (
                      <span
                        key={f.name}
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                      >
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Structure:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {profile.structure.hasApi && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>API</span>}
                    {profile.structure.hasFrontend && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Frontend</span>}
                    {profile.structure.hasDatabase && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Database</span>}
                    {profile.structure.hasTests && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Tests</span>}
                    {profile.structure.hasCICD && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>CI/CD</span>}
                    {profile.structure.isMonorepo && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Monorepo</span>}
                    {profile.structure.hasDocker && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Docker</span>}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Package manager:</span>
                  <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{profile.packageManager}</span>
                </div>
              </div>
            </div>

            {/* Suggested team */}
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Suggested Team ({enabledCount} agents)
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                The facilitator runs meetings. PM, critic, and north-star form the mandatory triad for decision meetings. Domain agents add project-specific expertise.
              </p>
              <div className="space-y-2">
                {agents.map((agent, i) => (
                  <label
                    key={agent.template}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: agent.enabled ? 'var(--accent-muted)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={agent.enabled}
                      onChange={() => toggleAgent(i)}
                      className="accent-[var(--accent)]"
                    />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {agent.name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {agent.description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('path')}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Back
              </button>
              <button
                onClick={() => setStep('customize')}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Customize ({enabledCount} agents)
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Customize */}
        {step === 'customize' && (
          <div className="space-y-4">
            {agents.filter(a => a.enabled).map((agent, i) => {
              const originalIndex = agents.findIndex(a => a.template === agent.template);
              return (
                <div
                  key={agent.template}
                  className="rounded-lg p-4"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {agent.name}
                    </span>
                    <select
                      value={agent.model}
                      onChange={(e) => updateAgent(originalIndex, 'model', e.target.value)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {MODEL_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={agent.description}
                    onChange={(e) => updateAgent(originalIndex, 'description', e.target.value)}
                    className="w-full px-3 py-2 rounded text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              );
            })}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep(profile ? 'scan' : 'path')}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating || enabledCount === 0}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {generating ? 'Generating...' : `Generate ${enabledCount} Agents`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'generate' && (
          <div className="space-y-6">
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {generatedFiles.length} agents generated
                </h3>
              </div>

              <div className="space-y-1 mb-6">
                {generatedFiles.map(f => (
                  <div key={f} className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {f}
                  </div>
                ))}
              </div>

              <div
                className="rounded-lg p-4 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>What&apos;s next:</p>
                <ol className="space-y-2" style={{ color: 'var(--text-secondary)' }}>
                  <li>1. Keep this Agent Council server running</li>
                  <li>2. Open your project in Claude Code (Desktop or CLI)</li>
                  <li>3. Ask for a meeting in plain language — <em style={{ color: 'var(--text-muted)' }}>&quot;what should we work on today?&quot;</em> or <em style={{ color: 'var(--text-muted)' }}>&quot;let&apos;s review the dashboard design&quot;</em></li>
                  <li>4. Watch the meeting live at <a href="/meetings" className="underline" style={{ color: 'var(--accent)' }}>/meetings</a></li>
                </ol>
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  No special commands needed. Claude Code reads the agent files you just generated and the facilitator picks the right meeting format automatically.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href="/meetings"
                className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Open Meeting Viewer
              </a>
              <a
                href="/agents"
                className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                View Agents
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
