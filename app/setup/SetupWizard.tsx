'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ProjectProfile } from '@/lib/types';

type Step = 'path' | 'scan' | 'customize' | 'generate';

interface McpTarget {
  exists: boolean;
  configured: boolean;
  path: string;
}

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
  'project-manager': { description: 'Tracks project state, provides grounding', defaultModel: 'opus' },
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

/** Copyable first-meeting prompt — uses project name for personalization */
function FirstMeetingPrompt({ projectPath, suggestedTopic }: { projectPath: string; suggestedTopic?: string | null }) {
  const [copied, setCopied] = useState(false);
  const projectName = projectPath.split(/[/\\]/).filter(Boolean).pop() || 'this project';
  const prompt = suggestedTopic
    ? `Let's discuss: ${suggestedTopic}`
    : `Let's do a quick direction check on ${projectName} — what should we focus on?`;

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="px-3 py-2 rounded cursor-pointer group relative"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      onClick={handleCopy}
      title="Click to copy"
    >
      <code className="text-xs" style={{ color: 'var(--accent)' }}>
        &quot;{prompt}&quot;
      </code>
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs transition-opacity"
        style={{ color: copied ? 'var(--live-green)' : 'var(--text-muted)', opacity: copied ? 1 : undefined }}
      >
        {copied ? 'Copied!' : <span className="opacity-0 group-hover:opacity-100 transition-opacity">click to copy</span>}
      </span>
    </div>
  );
}

function SetupWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoScanTriggered = useRef(false);
  const [step, setStep] = useState<Step>('path');
  const [projectPath, setProjectPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState<string[]>([]);
  const scanLogRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [agents, setAgents] = useState<AgentSelection[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectInfo, setConnectInfo] = useState<{ hasAgents: boolean; agentCount: number; hasFacilitator: boolean; generatedAgents?: string[]; profile?: ProjectProfile; scanWarning?: string } | null>(null);
  const [generateError, setGenerateError] = useState('');
  const [mcpTargets, setMcpTargets] = useState<Record<string, McpTarget> | null>(null);
  const [mcpConfiguring, setMcpConfiguring] = useState(false);
  const [mcpDone, setMcpDone] = useState<Record<string, boolean>>({});
  const [mcpServerPath, setMcpServerPath] = useState('');
  const [mcpConfirmTarget, setMcpConfirmTarget] = useState<string | null>(null);
  const [mcpTestResult, setMcpTestResult] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  // Check MCP status when connect succeeds or generate succeeds
  useEffect(() => {
    if (connected || generatedFiles.length > 0) {
      fetch('/api/setup/mcp')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.targets) setMcpTargets(data.targets);
          if (data?.serverPath) setMcpServerPath(data.serverPath);
        })
        .catch(() => {});
    }
  }, [connected, generatedFiles]);

  const handleConfigureMcp = async (targets: string[]) => {
    setMcpConfiguring(true);
    try {
      const res = await fetch('/api/setup/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      if (res.ok) {
        const data = await res.json();
        const done: Record<string, boolean> = {};
        for (const [key, result] of Object.entries(data.results || {})) {
          done[key] = (result as { success: boolean }).success;
        }
        setMcpDone(done);
        // Re-fetch targets to get updated status
        const statusRes = await fetch('/api/setup/mcp');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData?.targets) setMcpTargets(statusData.targets);
        }
      }
    } catch {
      // Silent — MCP setup is optional
    } finally {
      setMcpConfiguring(false);
      setMcpConfirmTarget(null);
    }
  };

  const handleTestMcp = async () => {
    setMcpTestResult({ status: 'testing' });
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setMcpTestResult({ status: 'success', message: 'Council API is reachable. MCP server will be able to connect.' });
      } else {
        setMcpTestResult({ status: 'error', message: `API returned status ${res.status}` });
      }
    } catch {
      setMcpTestResult({ status: 'error', message: 'Could not reach the Council API. Make sure the app is running.' });
    }
  };

  const handleConnect = async () => {
    if (!projectPath.trim()) return;
    setConnecting(true);
    setConnectError('');

    // Strip surrounding quotes and normalize path separators
    const cleanPath = projectPath.trim()
      .replace(/^["']+|["']+$/g, '')  // strip quotes from terminal paste
      .replace(/[/\\]+$/g, '');        // strip trailing slashes

    // Basic client-side path validation
    const isAbsolute = /^[A-Za-z]:[/\\]/.test(cleanPath) || cleanPath.startsWith('/');
    if (!isAbsolute) {
      setConnectError('Please enter an absolute path (e.g. C:\\Projects\\my-app or /home/user/my-app)');
      setConnecting(false);
      return;
    }

    try {
      // Validate that path exists and is a directory on the server
      const res = await fetch('/api/setup/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath }),
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
            body: JSON.stringify({ path: `${cleanPath}/${dir}` }),
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
      const connectRes = await fetch('/api/setup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: cleanPath,
          meetingsDir: foundMeetingsDir,
        }),
      });
      if (!connectRes.ok) {
        const errData = await connectRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to connect project');
      }
      const connectData = await connectRes.json();

      const agentCount = connectData.agentCount ?? 0;
      setConnectInfo({
        hasAgents: agentCount > 0,
        agentCount,
        hasFacilitator: connectData.hasFacilitator ?? false,
        generatedAgents: connectData.generatedAgents,
        profile: connectData.profile,
        scanWarning: connectData.scanWarning,
      });
      setConnected(true);
      // Refresh the nav to show the newly active project
      router.refresh();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  // Auto-scan if ?scan=projectName is in the URL (from "Full setup" link)
  useEffect(() => {
    const scanParam = searchParams.get('scan');
    if (scanParam && !autoScanTriggered.current) {
      autoScanTriggered.current = true;
      // Look up the project path from the API
      fetch('/api/projects')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const project = data.projects.find((p: { name: string }) => p.name === scanParam);
          if (project?.path) {
            setProjectPath(project.path);
            // Trigger scan with the project path
            setScanning(true);
            fetch('/api/setup/scan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: project.path }),
            })
              .then(r => r.ok ? r.json() : Promise.reject('Scan failed'))
              .then((data: ProjectProfile) => {
                setProfile(data);
                const selections: AgentSelection[] = [];
                if (!data.suggestedAgents.includes('facilitator')) {
                  data.suggestedAgents.unshift('facilitator');
                }
                for (const [template, info] of Object.entries(ALL_AGENTS)) {
                  selections.push({
                    template, name: template,
                    description: info.description,
                    model: info.defaultModel,
                    tools: [...DEFAULT_TOOLS],
                    enabled: data.suggestedAgents.includes(template) || template === 'facilitator',
                  });
                }
                setAgents(selections);
                setStep('scan');
              })
              .catch(() => setScanError('Failed to scan project'))
              .finally(() => setScanning(false));
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  // Auto-scroll the scan progress log
  useEffect(() => {
    if (scanLogRef.current) {
      scanLogRef.current.scrollTop = scanLogRef.current.scrollHeight;
    }
  }, [scanProgress]);

  const handleScan = async () => {
    if (!projectPath.trim()) return;
    setScanning(true);
    setScanError('');
    setScanProgress([]);

    const cleanPath = projectPath.trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/[/\\]+$/g, '');

    try {
      const res = await fetch('/api/setup/ai-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Scan failed');
      }

      // Read SSE stream for live progress
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) throw new Error('No response stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (eventType === 'status') {
              setScanProgress(prev => [...prev, data.message]);
            } else if (eventType === 'progress') {
              setScanProgress(prev => [...prev, data.detail]);
            } else if (eventType === 'result') {
              if (data.profile) setProfile(data.profile);

              const selections: AgentSelection[] = [];
              const suggestedAgents: string[] = data.suggestedAgents || Object.keys(ALL_AGENTS).slice(0, 6);
              if (!suggestedAgents.includes('facilitator')) suggestedAgents.unshift('facilitator');

              for (const [template, info] of Object.entries(ALL_AGENTS)) {
                const aiDesc = data.agentDescriptions?.[template];
                selections.push({
                  template,
                  name: template,
                  description: aiDesc || info.description,
                  model: info.defaultModel,
                  tools: [...DEFAULT_TOOLS],
                  enabled: suggestedAgents.includes(template),
                });
              }

              setAgents(selections);
              setStep('scan');
            } else if (eventType === 'error') {
              throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
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
      const targetDir = projectPath.trim().replace(/^["']+|["']+$/g, '').replace(/[/\\]+$/g, '') || '.';

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
      setGeneratedFiles(data.created || []);

      // Auto-connect the project so meetings/agents pages work
      if (targetDir !== '.') {
        try {
          await fetch('/api/setup/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectPath: targetDir,
              meetingsDir: 'meetings',
            }),
          });
        } catch { /* non-critical — agents are already generated */ }
      }

      setStep('generate');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
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
            {step === 'path' && !connected && 'Connect Your Project'}
            {step === 'path' && connected && 'Project Connected'}
            {['scan', 'customize', 'generate'].includes(step) && 'Set Up Your Agent Team'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {step === 'path' && !connected && 'Point us at your project and we\'ll get you set up.'}
            {step === 'path' && connected && 'Here\'s what we found.'}
            {step === 'scan' && 'Here\'s what we found. Hit Set Up Team to get started.'}
            {step === 'customize' && 'Fine-tune agents before generating.'}
            {step === 'generate' && 'Your agents are ready.'}
          </p>
        </div>

        {/* Step indicator — only for scan/customize/generate */}
        {['scan', 'customize', 'generate'].includes(step) && (
          <div className="flex gap-2 mb-8">
            {(['scan', 'customize', 'generate'] as Step[]).map((s, i) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full"
                style={{
                  background: i <= ['scan', 'customize', 'generate'].indexOf(step)
                    ? 'var(--accent)'
                    : 'var(--border)',
                }}
              />
            ))}
          </div>
        )}

        {/* Step: Path — connect project */}
        {step === 'path' && (
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
                placeholder={typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win') ? 'C:\\Projects\\my-app' : '/home/user/my-app'}
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
                  onClick={() => { handleConnect().then(() => handleScan()); }}
                  disabled={!projectPath.trim() || connecting || scanning}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {scanning ? 'Scanning...' : 'Connect & scan'}
                </button>
              </div>
              {scanning && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
                    <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                    Claude is analyzing your project...
                  </div>
                  {scanProgress.length > 0 && (
                    <div
                      ref={scanLogRef}
                      className="text-xs space-y-0.5 px-3 py-2 rounded max-h-32 overflow-y-auto"
                      style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.7rem' }}
                    >
                      {scanProgress.map((msg, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span style={{ color: 'var(--accent)', opacity: i === scanProgress.length - 1 ? 1 : 0.4 }}>
                            {i === scanProgress.length - 1 ? '▸' : '·'}
                          </span>
                          <span style={{ opacity: i === scanProgress.length - 1 ? 1 : 0.5 }}>{msg}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {scanError && (
                <p className="text-xs mt-2" style={{ color: 'var(--error, #ef4444)' }}>
                  {scanError}
                </p>
              )}
              {!scanning && (
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Connect</strong> watches your meetings directory.{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>Connect &amp; scan</strong> uses Claude Code to analyze your codebase and suggest an agent team.
                </p>
              )}
            </div>

            <a
              href="/guide"
              className="text-sm hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              How does this work? Read the guide &rarr;
            </a>
          </div>
        )}

        {/* Connected card — shown on path step when connected, hidden during scan */}
        {step === 'path' && connected && !scanning && (
          <div className="mt-6 space-y-6">
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--live-green)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Connected</h3>
              </div>
              {connectInfo && (
                <div className="text-sm space-y-2 mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {/* Profile summary */}
                  {connectInfo.profile && (
                    <p>
                      Detected{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {connectInfo.profile.languages.slice(0, 3).map(l => l.name).join(', ')}
                      </strong>
                      {connectInfo.profile.frameworks.length > 0 && (
                        <> with <strong style={{ color: 'var(--text-primary)' }}>{connectInfo.profile.frameworks.map(f => f.name).join(', ')}</strong></>
                      )}
                      {connectInfo.profile.scanQuality && (
                        <span className="ml-1 text-xs" style={{ color: connectInfo.profile.scanQuality.quality === 'rich' ? 'var(--live-green)' : connectInfo.profile.scanQuality.quality === 'basic' ? 'var(--warning)' : 'var(--text-muted)' }}>
                          ({connectInfo.profile.scanQuality.quality} scan, {connectInfo.profile.scanQuality.score}/10)
                        </span>
                      )}.
                    </p>
                  )}
                  {/* Scan warning — surfaces scan failures, truncation, or low quality */}
                  {connectInfo.scanWarning && (
                    <p className="px-3 py-2 rounded text-xs" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>
                      {connectInfo.scanWarning}
                    </p>
                  )}
                  {/* Agent status */}
                  {connectInfo.generatedAgents && connectInfo.generatedAgents.length > 0 ? (
                    <p>
                      Generated <strong style={{ color: 'var(--text-primary)' }}>{connectInfo.generatedAgents.length} project-aware agents</strong> (architect, critic, developer, north-star, PM).
                      {!connectInfo.hasFacilitator && (
                        <span style={{ color: 'var(--warning)' }}> No facilitator — <button onClick={() => handleScan()} className="underline" style={{ color: 'var(--accent)' }}>set one up</button> to run meetings.</span>
                      )}
                    </p>
                  ) : connectInfo.hasAgents ? (
                    <p>
                      Found <strong style={{ color: 'var(--text-primary)' }}>{connectInfo.agentCount} agents</strong> in your project.
                      {connectInfo.hasFacilitator
                        ? <span style={{ color: 'var(--live-green)' }}> Facilitator detected — meetings are ready.</span>
                        : <span style={{ color: 'var(--warning)' }}> No facilitator found — you&apos;ll need one to run meetings. <button onClick={() => handleScan()} className="underline" style={{ color: 'var(--accent)' }}>Generate agents</button></span>
                      }
                    </p>
                  ) : (
                    <p style={{ color: 'var(--warning)' }}>
                      No agents found in <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>.claude/agents/</code>. You&apos;ll need to set up a team before running meetings. <button onClick={() => handleScan()} className="underline" style={{ color: 'var(--accent)' }}>Set up agents</button>
                    </p>
                  )}
                  <p>The meeting viewer is now watching your project&apos;s meetings directory.</p>
                  {/* Connection verification indicator */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--live-green)' }} />
                    <span className="text-xs" style={{ color: 'var(--live-green)' }}>Viewer connected</span>
                  </div>
                </div>
              )}
              {/* First meeting prompt — personalized with project name */}
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Run your first meeting
                </h4>
                <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <p>Open your project in Claude Code and paste this prompt:</p>
                  <FirstMeetingPrompt projectPath={projectPath} suggestedTopic={profile?.synthesis?.suggestedFirstTopic} />
                  <p style={{ color: 'var(--text-muted)' }}>
                    The facilitator will pick the right format and assemble your team. Watch it live in the meeting viewer.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mb-4">
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

              {/* MCP auto-setup */}
              {mcpTargets && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Enable live meeting updates
                  </h4>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Agent Council can show real-time progress during meetings (which agent is speaking, round changes). This requires adding the MCP server to your Claude config.
                  </p>

                  {/* Server path info */}
                  {mcpServerPath && (
                    <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>MCP server: </span>
                      <code style={{ color: 'var(--text-secondary)' }}>{mcpServerPath}</code>
                    </div>
                  )}

                  {Object.entries(mcpTargets).map(([key, target]) => {
                    const label = key === 'claudeCode' ? 'Claude Code (CLI)' : 'Claude Desktop';
                    const configured = target.configured || mcpDone[key];
                    const isConfirming = mcpConfirmTarget === key;
                    return (
                      <div key={key} className="py-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: configured ? 'var(--live-green)' : 'var(--border)' }}
                            />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                            {!target.exists && !configured && (
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(not installed)</span>
                            )}
                          </div>
                          {configured ? (
                            <div className="flex items-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="11" stroke="var(--live-green)" strokeWidth="2" />
                                <path d="M7 12.5L10.5 16L17 9" stroke="var(--live-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span className="text-xs" style={{ color: 'var(--live-green)' }}>Configured</span>
                            </div>
                          ) : target.exists ? (
                            <button
                              onClick={() => setMcpConfirmTarget(isConfirming ? null : key)}
                              disabled={mcpConfiguring}
                              className="text-xs px-3 py-1 rounded transition-opacity disabled:opacity-50"
                              style={{ background: 'var(--bg-elevated)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                            >
                              {isConfirming ? 'Cancel' : 'Add'}
                            </button>
                          ) : null}
                        </div>

                        {/* Configured success detail */}
                        {configured && mcpDone[key] && (
                          <div className="mt-1 ml-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                            Written to <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', fontSize: '0.65rem' }}>{target.path}</code>
                          </div>
                        )}

                        {/* Existing config indicator */}
                        {!configured && target.exists && target.configured === false && !isConfirming && (
                          <div className="mt-1 ml-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                            Config file exists at <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', fontSize: '0.65rem' }}>{target.path}</code>
                          </div>
                        )}

                        {/* Confirmation panel */}
                        {isConfirming && (
                          <div className="mt-2 ml-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                            <p className="font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                              This will add the following to your config:
                            </p>
                            <pre
                              className="px-3 py-2 rounded mb-2 overflow-x-auto"
                              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: '1.4' }}
                            >
{`// ${target.path}
{
  "mcpServers": {
    "agent-council": {
      "command": "node",
      "args": ["${mcpServerPath.replace(/\\/g, '/')}"]
    }
  }
}`}
                            </pre>
                            <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
                              {target.exists
                                ? 'Your existing config will be preserved. Only the "agent-council" entry under "mcpServers" will be added or updated.'
                                : 'A new config file will be created.'}
                            </p>
                            <button
                              onClick={() => handleConfigureMcp([key])}
                              disabled={mcpConfiguring}
                              className="px-3 py-1.5 rounded text-xs font-medium transition-opacity disabled:opacity-50"
                              style={{ background: 'var(--accent)', color: 'white' }}
                            >
                              {mcpConfiguring ? 'Writing...' : 'Confirm'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Manual copy fallback */}
                  {mcpServerPath && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                        Or copy the config manually:
                      </p>
                      <div className="relative">
                        <pre
                          className="px-3 py-2 rounded text-xs overflow-x-auto"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: '1.4' }}
                        >
{`{
  "mcpServers": {
    "agent-council": {
      "command": "node",
      "args": ["${mcpServerPath.replace(/\\/g, '/')}"]
    }
  }
}`}
                        </pre>
                        <button
                          onClick={() => {
                            const json = JSON.stringify({
                              mcpServers: {
                                'agent-council': {
                                  command: 'node',
                                  args: [mcpServerPath.replace(/\\/g, '/')],
                                },
                              },
                            }, null, 2);
                            navigator.clipboard.writeText(json);
                          }}
                          className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-100 opacity-60"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Post-configure messages */}
                  {Object.values(mcpDone).some(Boolean) && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Restart Claude Code / Claude Desktop for the MCP tools to appear.
                      </p>
                      {/* Test connection button */}
                      <button
                        onClick={handleTestMcp}
                        disabled={mcpTestResult.status === 'testing'}
                        className="text-xs px-3 py-1.5 rounded transition-opacity disabled:opacity-50"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      >
                        {mcpTestResult.status === 'testing' ? 'Testing...' : 'Test connection'}
                      </button>
                      {mcpTestResult.status === 'success' && (
                        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--live-green)' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
                            <path d="M7 12.5L10.5 16L17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {mcpTestResult.message}
                        </p>
                      )}
                      {mcpTestResult.status === 'error' && (
                        <p className="text-xs" style={{ color: 'var(--error)' }}>
                          {mcpTestResult.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scan error — shown on path step */}
        {step === 'path' && scanError && (
          <p className="text-sm mt-4" style={{ color: 'var(--error)' }}>{scanError}</p>
        )}

        {/* Step: Scan Results */}
        {step === 'scan' && profile && (
          <div className="space-y-6">
            {/* Detected info */}
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Project Profile
                </h3>
                {profile.scanQuality && (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      background: profile.scanQuality.quality === 'rich' ? 'rgba(34,197,94,0.15)' : profile.scanQuality.quality === 'basic' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                      color: profile.scanQuality.quality === 'rich' ? 'var(--live-green)' : profile.scanQuality.quality === 'basic' ? 'var(--warning)' : 'var(--error)',
                    }}
                  >
                    {profile.scanQuality.quality === 'rich' ? 'Rich scan' : profile.scanQuality.quality === 'basic' ? 'Partial scan' : 'Minimal scan'} ({profile.scanQuality.score}/10)
                  </span>
                )}
              </div>
              {/* Minimal scan warning */}
              {profile.scanQuality?.quality === 'minimal' && (
                <div className="mb-4 px-3 py-2 rounded text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--text-secondary)' }}>
                  Not enough signal to personalize the setup. The agents will use generic prompts.
                  {profile.scanQuality.missingSignals.length > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}> Missing: {profile.scanQuality.missingSignals.slice(0, 3).join(', ')}.</span>
                  )}
                </div>
              )}
              {/* Truncation warning */}
              {profile.truncated && (
                <div className="mb-4 px-3 py-2 rounded text-xs" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: 'var(--warning)' }}>
                  Large repository — scan was capped at 50,000 files. Some parts of the codebase may not be reflected in agent context.
                </div>
              )}
              {/* Basic scan notice */}
              {profile.scanQuality?.quality === 'basic' && (
                <div className="mb-4 px-3 py-2 rounded text-xs" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: 'var(--text-secondary)' }}>
                  Partial project insight — agents will have some project context but may miss nuances.
                  {profile.scanQuality.missingSignals.length > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}> Could not detect: {profile.scanQuality.missingSignals.slice(0, 2).join(', ')}.</span>
                  )}
                </div>
              )}
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

            {generateError && (
              <p className="text-sm" style={{ color: 'var(--error)' }}>{generateError}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep('path')}
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
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Setting up...
                  </span>
                ) : `Set Up Team (${enabledCount} agents)`}
              </button>
              <button
                onClick={() => { setStep('customize'); setGenerateError(''); }}
                className="text-xs transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                Customize first&hellip;
              </button>
            </div>
          </div>
        )}

        {/* Step: Customize */}
        {step === 'customize' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              <span>{enabledCount} agent{enabledCount !== 1 ? 's' : ''} selected</span>
              <span>&middot;</span>
              <span>{agents.filter(a => a.enabled && a.model === 'opus').length} opus</span>
              <span>{agents.filter(a => a.enabled && a.model === 'sonnet').length} sonnet</span>
              <span>{agents.filter(a => a.enabled && a.model === 'haiku').length} haiku</span>
            </div>
            {agents.filter(a => a.enabled).map((agent) => {
              const originalIndex = agents.findIndex(a => a.template === agent.template);
              const isMandatory = ['facilitator', 'project-manager', 'critic', 'north-star'].includes(agent.template);
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
                    {isMandatory && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)', fontSize: '0.65rem' }}>
                        {agent.template === 'facilitator' ? 'engine' : 'triad'}
                      </span>
                    )}
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
                    <button
                      onClick={() => toggleAgent(originalIndex)}
                      className="ml-auto text-xs px-2 py-0.5 rounded transition-colors hover:brightness-125"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      Remove
                    </button>
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

            {generateError && (
              <p className="text-sm mt-2" style={{ color: 'var(--error)' }}>{generateError}</p>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => { setStep(profile ? 'scan' : 'path'); setGenerateError(''); }}
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
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : `Generate ${enabledCount} Agents`}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'generate' && (
          <div className="space-y-6">
            {/* Success banner */}
            <div
              className="rounded-lg p-8 text-center"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)' }}
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="11" stroke="var(--live-green)" strokeWidth="2" />
                  <path d="M7 12.5L10.5 16L17 9" stroke="var(--live-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Your team is ready
                </h3>
              </div>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                {generatedFiles.length} agents created in <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>.claude/agents/</code>
              </p>
            </div>

            {/* What we found — synthesis from scanner */}
            {profile?.synthesis && (profile.synthesis.stackSignals.length > 0 || profile.synthesis.gaps.length > 0) && (
              <div
                className="rounded-lg p-5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <p className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  What we found
                </p>
                {profile.synthesis.stackSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {profile.synthesis.stackSignals.slice(0, 4).map(s => (
                      <span key={s} className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {profile.synthesis.gaps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.synthesis.gaps.map(g => (
                      <span key={g} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--warning)' }}>
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* What's next — prominent */}
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent)' }}
            >
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Next: open your project in Claude Code and ask for a meeting
              </p>
              <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p>Open your project in Claude Code and paste this prompt:</p>
                <FirstMeetingPrompt projectPath={projectPath} suggestedTopic={profile?.synthesis?.suggestedFirstTopic} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  The facilitator picks the right format and assembles the team automatically. The meeting shows up live here.
                </p>
              </div>
            </div>

            {/* Generated files (collapsed) */}
            <details className="rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <summary className="px-4 py-3 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                View generated files ({generatedFiles.length})
              </summary>
              <div className="px-4 pb-3 space-y-1">
                {generatedFiles.map(f => (
                  <div key={f} className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {f}
                  </div>
                ))}
              </div>
            </details>

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

export default function SetupWizard() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <SetupWizardInner />
    </Suspense>
  );
}
