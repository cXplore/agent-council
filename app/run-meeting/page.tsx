'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const AGENTS = [
  { id: 'project-manager', label: 'Project Manager', shortLabel: 'PM', role: 'Grounds discussion in reality — what exists, what\'s feasible, what ships' },
  { id: 'critic', label: 'Critic', shortLabel: 'Critic', role: 'Challenges assumptions and identifies blind spots' },
  { id: 'north-star', label: 'North Star', shortLabel: 'North Star', role: 'Advocates for impact and possibility' },
  { id: 'architect', label: 'Architect', shortLabel: 'Architect', role: 'System design, patterns, and trade-offs' },
  { id: 'developer', label: 'Developer', shortLabel: 'Developer', role: 'Core engineer — writes and reviews code' },
  { id: 'designer', label: 'Designer', shortLabel: 'Designer', role: 'UI/UX, accessibility, and user flows' },
];

const MEETING_TYPES = [
  'direction-check',
  'design-review',
  'strategy',
  'architecture',
  'standup',
  'sprint-planning',
  'retrospective',
  'incident-review',
];

type LLMStatus = {
  available: boolean;
  backend: 'agent-sdk' | 'anthropic-api' | 'none';
  hint?: string;
};

type OutcomeItem = { text: string; rationale?: string; assignee?: string; slug?: string };
type Outcomes = {
  decisions?: OutcomeItem[];
  actions?: OutcomeItem[];
  openQuestions?: OutcomeItem[];
};

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; jobId?: string; progress?: string; meetingFile?: string }
  | { phase: 'done'; meetingFile: string; outcomes?: Outcomes; elapsed?: number }
  | { phase: 'error'; message: string; errorType?: string };

type ProjectInfo = {
  name: string;
  path: string;
  accessible: boolean;
};

type ProjectBrief = {
  name: string;
  path: string | null;
  meetingCount: number;
  profile: {
    languages: { name: string; fileCount: number; percentage: number }[];
    frameworks: { name: string; confidence: string; version?: string }[];
    structure: Record<string, boolean>;
    projectDescription?: string;
    testInfo?: { frameworks: string[]; fileCount: number };
    entryPoint?: string;
    synthesis?: {
      stackSignals: string[];
      gaps: string[];
      suggestedFirstTopic: string | null;
    };
  } | null;
  synthesis: {
    stackSignals: string[];
    gaps: string[];
    suggestedFirstTopic: string | null;
  } | null;
};

export default function RunMeetingPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-white/40">Loading...</div>}>
      <RunMeetingPage />
    </Suspense>
  );
}

function RunMeetingPage() {
  const searchParams = useSearchParams();
  const projectParam = searchParams.get('project');
  const topicParam = searchParams.get('topic');
  const [topic, setTopic] = useState(topicParam ?? '');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([
    'project-manager', 'critic', 'north-star',
  ]);
  const [type, setType] = useState('direction-check');
  const [rounds, setRounds] = useState(2);
  const [codeAware, setCodeAware] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [runState, setRunState] = useState<RunState>({ phase: 'idle' });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Project state
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Load projects on mount
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data) => {
        const list: ProjectInfo[] = (data.projects ?? []).map((p: ProjectInfo) => ({
          name: p.name,
          path: p.path,
          accessible: p.accessible,
        }));
        setProjects(list);
        // Prefer URL param ?project=<name>, fall back to first accessible
        const fromParam = projectParam ? list.find(p => p.name === projectParam && p.accessible) : null;
        const first = fromParam || list.find(p => p.accessible);
        if (first) setSelectedProject(first.name);
      })
      .catch(() => {});
  }, [projectParam]);

  // Fetch brief when project changes
  const fetchBrief = useCallback(async (projectName: string) => {
    if (!projectName) { setBrief(null); return; }
    setBriefLoading(true);
    try {
      const res = await fetch(`/api/projects/brief?project=${encodeURIComponent(projectName)}`);
      if (res.ok) {
        setBrief(await res.json());
      } else {
        setBrief(null);
      }
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProject) fetchBrief(selectedProject);
  }, [selectedProject, fetchBrief]);

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Browser tab notification on meeting complete
  useEffect(() => {
    if (runState.phase !== 'done') return;
    const originalTitle = document.title;
    document.title = '\u2713 Meeting complete \u2014 Agent Council';
    return () => { document.title = originalTitle; };
  }, [runState.phase]);

  // Check LLM availability on mount
  useEffect(() => {
    fetch('/api/council/llm-status')
      .then(r => r.json())
      .then(setLlmStatus)
      .catch(() => setLlmStatus({ available: false, backend: 'none', hint: 'Server not reachable' }));
  }, []);

  function toggleAgent(id: string) {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }

  async function runMeeting() {
    if (!topic.trim() || selectedAgents.length < 2) return;

    setRunState({ phase: 'running', progress: 'Starting meeting...' });

    try {
      const res = await fetch('/api/council/multi-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          agents: selectedAgents,
          type,
          rounds,
          codeAware,
          async: true,
          ...(selectedProject ? { project: selectedProject } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setRunState({ phase: 'error', message: err.error || 'Failed to start meeting', errorType: err.errorType });
        return;
      }

      const { jobId, meetingFile: mf } = await res.json();
      setRunState({ phase: 'running', jobId, progress: 'Meeting in progress...', meetingFile: mf });

      // Poll for completion — store handle in ref for cleanup
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/council/job-status/${jobId}`);
          if (statusRes.status === 404) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setRunState({ phase: 'error', message: 'Meeting job was lost (server may have restarted). Try running again.' });
            return;
          }
          const status = await statusRes.json();

          if (status.status === 'running') {
            setRunState(prev => ({ phase: 'running', jobId, progress: status.progress || 'Meeting in progress...', meetingFile: (prev as { meetingFile?: string }).meetingFile }));
          } else if (status.status === 'complete') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            const result = status.result ?? {};
            setRunState({
              phase: 'done',
              meetingFile: result.meetingFile || '',
              outcomes: result.outcomes,
              elapsed: status.elapsed,
            });
          } else if (status.status === 'failed') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setRunState({ phase: 'error', message: status.error || 'Meeting failed', errorType: status.errorType });
          }
        } catch {
          // Polling error — continue trying
        }
      }, 3000);
    } catch (err) {
      setRunState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Failed to start meeting',
      });
    }
  }

  // Use suggested topic from scanner
  function useSuggestedTopic() {
    if (brief?.synthesis?.suggestedFirstTopic) {
      setTopic(brief.synthesis.suggestedFirstTopic);
    }
  }

  const canRun = topic.trim().length > 0 && selectedAgents.length >= 2 && llmStatus?.available && runState.phase === 'idle';

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Run Meeting</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Run an agent meeting directly from the browser — no Claude Code required.
      </p>

      {/* LLM Status */}
      {llmStatus && !llmStatus.available && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
        }}>
          <strong>No LLM backend available.</strong>{' '}
          {llmStatus.hint || 'Set ANTHROPIC_API_KEY in .env.local to enable.'}
        </div>
      )}

      {/* Backend status shown in Settings, not here — less noise */}

      {/* Project Selector */}
      {projects.length > 0 && (
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Project</span>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            disabled={runState.phase === 'running'}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            {projects.filter(p => p.accessible).map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      {/* Project Context Card */}
      {selectedProject && (
        <div style={{
          marginBottom: 20,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {briefLoading ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              Scanning project...
            </div>
          ) : brief?.profile ? (
            <div style={{ padding: '10px 14px' }}>
              {/* Project description */}
              {brief.profile.projectDescription && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                  {brief.profile.projectDescription}
                </div>
              )}

              {/* Stack badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {brief.profile.languages.slice(0, 3).map(l => (
                  <span key={l.name} style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    background: 'var(--accent-muted)',
                    color: 'var(--accent)',
                    borderRadius: 4,
                  }}>
                    {l.name} {l.percentage}%
                  </span>
                ))}
                {brief.profile.frameworks.filter(f => f.confidence === 'high').map(f => (
                  <span key={f.name} style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: 'var(--color-action)',
                    borderRadius: 4,
                  }}>
                    {f.name}{f.version ? ` ${f.version}` : ''}
                  </span>
                ))}
                {brief.profile.testInfo && brief.profile.testInfo.fileCount > 0 && (
                  <span style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    background: 'rgba(251, 191, 36, 0.15)',
                    color: 'var(--color-open)',
                    borderRadius: 4,
                  }}>
                    {brief.profile.testInfo.frameworks.join(', ')} ({brief.profile.testInfo.fileCount} files)
                  </span>
                )}
              </div>

              {/* Gaps */}
              {brief.synthesis?.gaps && brief.synthesis.gaps.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {brief.synthesis.gaps.slice(0, 3).map((g, i) => (
                    <span key={i} style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--error)',
                      borderRadius: 4,
                    }}>
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Meeting count + suggested topic */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{brief.meetingCount} meeting{brief.meetingCount !== 1 ? 's' : ''}</span>
                {brief.synthesis?.suggestedFirstTopic && !topic && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <button
                      onClick={useSuggestedTopic}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: 0,
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      Use suggested topic
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : brief && !brief.profile ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              No scanner data available — project may not have source files.
              <div style={{ marginTop: 4, fontSize: 11 }}>
                {brief.meetingCount} meeting{brief.meetingCount !== 1 ? 's' : ''}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Topic */}
      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Topic</span>
        <textarea
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="What should the agents discuss? Be specific about the decision or question."
          rows={3}
          disabled={runState.phase === 'running'}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </label>

      {/* Agents */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
          Agents ({selectedAgents.length} selected)
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AGENTS.map(a => {
            const selected = selectedAgents.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAgent(a.id)}
                disabled={runState.phase === 'running'}
                title={a.role}
                aria-label={`${a.label}: ${a.role}`}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: selected ? 600 : 400,
                  background: selected ? 'var(--accent-muted)' : 'transparent',
                  color: selected ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${selected ? 'var(--border-glow)' : 'var(--border)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {a.shortLabel}
              </button>
            );
          })}
        </div>
        {selectedAgents.length < 2 && (
          <p style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>Select at least 2 agents</p>
        )}
      </div>

      {/* Advanced options */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 12,
          cursor: 'pointer',
          padding: '4px 0',
          marginBottom: showAdvanced ? 12 : 24,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>&#x25b8;</span>
        Advanced options
      </button>

      {showAdvanced && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Type</span>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              disabled={runState.phase === 'running'}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              {MEETING_TYPES.map(t => (
                <option key={t} value={t}>
                  {t.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
                </option>
              ))}
            </select>
          </label>

          <label style={{ width: 100 }}>
            <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Rounds</span>
            <select
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              disabled={runState.phase === 'running'}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </div>
      )}

      {/* Code-aware toggle */}
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
        cursor: 'pointer',
        fontSize: 13,
      }}>
        <input
          type="checkbox"
          checked={codeAware}
          onChange={e => setCodeAware(e.target.checked)}
          disabled={runState.phase === 'running'}
          style={{ accentColor: 'var(--accent)' }}
        />
        <span style={{ fontWeight: 500 }}>Code-aware</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          — inject relevant source files into agent context
        </span>
      </label>

      {/* Run button */}
      <button
        onClick={runMeeting}
        disabled={!canRun}
        style={{
          width: '100%',
          padding: '12px 20px',
          fontSize: 14,
          fontWeight: 600,
          background: canRun ? 'var(--accent)' : 'var(--bg-card)',
          color: canRun ? '#fff' : 'var(--text-muted)',
          border: 'none',
          borderRadius: 8,
          cursor: canRun ? 'pointer' : 'not-allowed',
          transition: 'all 0.15s',
        }}
      >
        {runState.phase === 'idle' ? 'Run Meeting' : 'Meeting in progress...'}
      </button>

      {/* Progress / Result */}
      <div role="status" aria-live="polite">
      {runState.phase === 'running' && (
        <div style={{
          marginTop: 16,
          padding: '12px 14px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid var(--accent-muted)',
          borderRadius: 8,
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.5s infinite',
            }} />
            {runState.progress || 'Running...'}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {runState.meetingFile ? (
              <>Watch live: <a href={`/meetings?file=${encodeURIComponent(runState.meetingFile)}`} style={{ color: 'var(--accent)' }}>{runState.meetingFile.replace(/\.md$/, '')}</a></>
            ) : (
              <>Watch at <a href="/meetings" style={{ color: 'var(--accent)' }}>Meetings</a></>
            )}
          </p>
        </div>
      )}

      {runState.phase === 'done' && (
        <div style={{
          marginTop: 16,
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            background: 'rgba(34, 197, 94, 0.06)',
            borderBottom: runState.outcomes ? '1px solid rgba(34, 197, 94, 0.15)' : undefined,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}>
            <span style={{ color: 'var(--live-green)', fontWeight: 600 }}>&#x2713; Meeting complete</span>
            {runState.elapsed && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                — {Math.round(runState.elapsed / 1000)}s
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {runState.meetingFile && (
                <a
                  href={`/meetings?file=${encodeURIComponent(runState.meetingFile)}`}
                  style={{ color: 'var(--live-green)', fontWeight: 500, fontSize: 12 }}
                >
                  View full &#x2192;
                </a>
              )}
              <button
                onClick={() => { setRunState({ phase: 'idle' }); setTopic(''); }}
                style={{
                  padding: '2px 10px',
                  fontSize: 11,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  cursor: 'pointer',
                }}
              >
                New
              </button>
            </div>
          </div>

          {/* Outcome summary */}
          {runState.outcomes && (
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(runState.outcomes.decisions?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-decision)', marginBottom: 3 }}>
                    Decisions ({runState.outcomes.decisions!.length})
                  </div>
                  {runState.outcomes.decisions!.slice(0, 3).map((d, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 10, marginBottom: 2, display: 'flex', gap: 6 }}>
                      <span style={{ color: 'var(--color-decision)', flexShrink: 0 }}>&#xb7;</span>
                      <span style={{ lineHeight: '1.4' }}>{d.text}</span>
                    </div>
                  ))}
                  {(runState.outcomes.decisions!.length > 3) && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 16 }}>
                      ...and {runState.outcomes.decisions!.length - 3} more
                    </div>
                  )}
                </div>
              )}

              {(runState.outcomes.actions?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-action)', marginBottom: 3 }}>
                    Actions ({runState.outcomes.actions!.length})
                  </div>
                  {runState.outcomes.actions!.slice(0, 3).map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 10, marginBottom: 2, display: 'flex', gap: 6 }}>
                      <span style={{ color: 'var(--color-action)', flexShrink: 0 }}>&#xb7;</span>
                      <span style={{ lineHeight: '1.4' }}>{a.text}</span>
                    </div>
                  ))}
                  {(runState.outcomes.actions!.length > 3) && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 16 }}>
                      ...and {runState.outcomes.actions!.length - 3} more
                    </div>
                  )}
                </div>
              )}

              {(runState.outcomes.openQuestions?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-open)', marginBottom: 3 }}>
                    Open ({runState.outcomes.openQuestions!.length})
                  </div>
                  {runState.outcomes.openQuestions!.slice(0, 2).map((q, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 10, marginBottom: 2, display: 'flex', gap: 6 }}>
                      <span style={{ color: 'var(--color-open)', flexShrink: 0 }}>?</span>
                      <span style={{ lineHeight: '1.4' }}>{q.text}</span>
                    </div>
                  ))}
                  {(runState.outcomes.openQuestions!.length > 2) && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 16 }}>
                      ...and {runState.outcomes.openQuestions!.length - 2} more
                    </div>
                  )}
                </div>
              )}

              {/* No outcomes extracted */}
              {!runState.outcomes.decisions?.length && !runState.outcomes.actions?.length && !runState.outcomes.openQuestions?.length && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No structured outcomes extracted — view the full meeting for details.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {runState.phase === 'error' && (
        <div style={{
          marginTop: 16,
          padding: '12px 14px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 8,
          fontSize: 13,
        }}>
          <strong>Error:</strong> {runState.message}
          {runState.errorType && runState.errorType !== 'unknown' && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {runState.errorType === 'auth_failure' && (
                <>Your API key is missing or invalid. Go to <a href="/settings" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Settings</a> to configure it, or set <code style={{ fontSize: 11, padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>ANTHROPIC_API_KEY</code> in <code style={{ fontSize: 11, padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>.env.local</code>.</>
              )}
              {runState.errorType === 'rate_limit' && 'You hit the API rate limit. Wait a minute and try again.'}
              {runState.errorType === 'timeout' && 'The LLM request timed out. Check your network connection and try again.'}
              {runState.errorType === 'model_error' && 'The requested model is not available. Check your provider configuration.'}
              {runState.errorType === 'no_provider' && (
                <>No API key configured. Set <code style={{ fontSize: 11, padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>ANTHROPIC_API_KEY</code> in <code style={{ fontSize: 11, padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>.env.local</code> and restart the server.</>
              )}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setRunState({ phase: 'idle' })}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
