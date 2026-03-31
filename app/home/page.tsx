'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

const AGENTS = [
  { id: 'project-manager', label: 'PM', color: '#4ade80' },
  { id: 'critic', label: 'Critic', color: '#f87171' },
  { id: 'north-star', label: 'North Star', color: '#a78bfa' },
  { id: 'architect', label: 'Architect', color: '#60a5fa' },
  { id: 'developer', label: 'Developer', color: '#fbbf24' },
  { id: 'designer', label: 'Designer', color: '#f472b6' },
];

const QUICK_ACTIONS = [
  { label: 'Run a meeting', icon: '▶', action: 'meeting' as const, ready: true },
  { label: 'Ask an agent', icon: '?', action: 'ask' as const, ready: true },
  { label: 'Daily brief', icon: '☀', action: 'brief' as const, ready: true },
  { label: 'Review code', icon: '◎', action: 'review' as const, ready: false },
  { label: 'Write docs', icon: '✎', action: 'docs' as const, ready: false },
  { label: 'Health check', icon: '♡', action: 'health' as const, ready: false },
];

type Phase = 'idle' | 'thinking' | 'done';

export default function HomePage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [answer, setAnswer] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [answerAgent, setAnswerAgent] = useState('');
  const [meetingCount, setMeetingCount] = useState<number | null>(null);
  const [activeActions, setActiveActions] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Agent Council';
    // Load quick stats
    fetch('/api/meetings')
      .then(r => r.ok ? r.json() : [])
      .then(meetings => setMeetingCount(Array.isArray(meetings) ? meetings.length : 0))
      .catch(() => {});
    fetch('/api/council/llm-status')
      .then(r => r.ok ? r.json() : null)
      .catch(() => {});
    fetch('/api/roadmap')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items) {
          const active = data.items.filter((i: { itemStatus: string }) => i.itemStatus === 'active' || i.itemStatus === 'working');
          setActiveActions(active.length);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;

    if (selectedAgent) {
      // Ask a specific agent
      setAskedQuestion(text);
      setPhase('thinking');
      setAnswerAgent(selectedAgent);
      try {
        const res = await fetch('/api/council/quick-consult', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, agent: selectedAgent, topic: text }),
        });
        if (res.ok) {
          const data = await res.json();
          setAnswer(data.answer || 'No response.');
          setPhase('done');
        } else {
          const err = await res.json().catch(() => ({}));
          setAnswer(`Error: ${err.error || 'Failed to get response'}`);
          setPhase('done');
        }
      } catch {
        setAnswer('Error: Could not reach the server.');
        setPhase('done');
      }
    } else {
      // Default: navigate to Run page with topic pre-filled
      router.push(`/run-meeting?topic=${encodeURIComponent(text)}`);
    }
  };

  const handleQuickAction = (action: string) => {
    if (action === 'meeting') {
      router.push('/run-meeting');
      return;
    } else if (action === 'ask') {
      // Toggle agent selection mode
      if (!selectedAgent) setSelectedAgent('critic');
    } else if (action === 'brief') {
      setInput("What should we focus on today? Give a quick status of the project.");
      setSelectedAgent('project-manager');
      // Auto-submit after a tick
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('[data-home-input]');
        if (el) el.form?.requestSubmit();
      }, 100);
    }
  };

  const reset = () => {
    setPhase('idle');
    setInput('');
    setAnswer('');
    setAnswerAgent('');
    setSelectedAgent(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Agent Council
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {meetingCount !== null && activeActions !== null
              ? `${meetingCount} meetings · ${activeActions} active actions`
              : 'Your agent team'}
          </p>
        </div>

        {/* Main input */}
        {phase === 'idle' && (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
              className="mb-4"
            >
              <div
                className="flex items-center rounded-lg overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                {selectedAgent && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgent(null)}
                    className="text-xs px-3 py-2 flex-shrink-0"
                    style={{
                      color: AGENTS.find(a => a.id === selectedAgent)?.color ?? 'var(--accent)',
                      borderRight: '1px solid var(--border)',
                    }}
                    title="Click to switch to meeting mode"
                  >
                    {AGENTS.find(a => a.id === selectedAgent)?.label ?? selectedAgent}
                  </button>
                )}
                <input
                  data-home-input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={selectedAgent ? `Ask ${AGENTS.find(a => a.id === selectedAgent)?.label ?? selectedAgent}...` : 'What do you want to work on?'}
                  className="flex-1 text-sm px-4 py-3 outline-none"
                  style={{ background: 'transparent', color: 'var(--text-primary)' }}
                  autoFocus
                />
                {input.trim() && (
                  <button
                    type="submit"
                    className="text-sm px-4 py-3 font-medium"
                    style={{ color: 'var(--accent)' }}
                  >
                    {selectedAgent ? 'Ask' : 'Go'}
                  </button>
                )}
              </div>
            </form>

            {/* Agent selector — visible when in ask mode */}
            {selectedAgent !== null && (
              <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
                {AGENTS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a.id)}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      background: selectedAgent === a.id ? 'rgba(124, 109, 216, 0.15)' : 'transparent',
                      color: selectedAgent === a.id ? a.color : 'var(--text-muted)',
                      border: `1px solid ${selectedAgent === a.id ? 'rgba(124, 109, 216, 0.3)' : 'transparent'}`,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map(qa => (
                <button
                  key={qa.action}
                  onClick={() => qa.ready ? handleQuickAction(qa.action) : undefined}
                  disabled={!qa.ready}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{
                    color: qa.ready ? 'var(--text-muted)' : 'var(--text-muted)',
                    border: `1px solid ${qa.ready ? 'var(--border)' : 'var(--border)'}`,
                    background: (qa.action === 'ask' && selectedAgent) ? 'var(--accent-muted)' : 'transparent',
                    opacity: qa.ready ? 1 : 0.4,
                    cursor: qa.ready ? 'pointer' : 'default',
                  }}
                  title={qa.ready ? undefined : 'Coming soon'}
                >
                  <span className="mr-1.5">{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>

            {/* Hint */}
            <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              {selectedAgent
                ? 'Ask a direct question — one agent responds'
                : 'Type a topic to start a meeting, or pick an agent to ask directly'}
            </p>
          </>
        )}

        {/* Thinking */}
        {phase === 'thinking' && (
          <div className="text-center py-8">
            <div className="inline-block w-2 h-2 rounded-full animate-pulse mb-3" style={{ background: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {answerAgent ? `${AGENTS.find(a => a.id === answerAgent)?.label ?? answerAgent} is thinking...` : 'Starting meeting...'}
            </p>
          </div>
        )}

        {/* Response */}
        {phase === 'done' && (
          <div>
            {/* Show the question */}
            <div
              className="rounded-lg px-4 py-2.5 text-sm mb-3"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
            >
              {askedQuestion || '...'}
            </div>
            {/* Agent attribution */}
            {answerAgent && (
              <div className="text-xs mb-2 flex items-center gap-2" style={{ color: AGENTS.find(a => a.id === answerAgent)?.color ?? 'var(--text-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                {AGENTS.find(a => a.id === answerAgent)?.label ?? answerAgent}
              </div>
            )}
            <div
              className="rounded-lg p-4 text-sm leading-relaxed mb-4 prose prose-sm prose-invert max-w-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={reset}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                New question
              </button>
              <button
                onClick={() => {
                  // Follow up — keep the agent, clear input
                  setPhase('idle');
                  setInput('');
                  setAnswer('');
                }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                Follow up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
