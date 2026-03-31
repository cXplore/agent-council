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
  { label: 'Review code', icon: '◎', action: 'review' as const, ready: true },
  { label: 'Write docs', icon: '✎', action: 'docs' as const, ready: true },
  { label: 'Health check', icon: '♡', action: 'health' as const, ready: true },
];

type Phase = 'idle' | 'thinking' | 'done';

export default function HomePage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [answer, setAnswer] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{ question: string; answer: string }[]>([]);
  const [answerAgent, setAnswerAgent] = useState('');
  const [meetingCount, setMeetingCount] = useState<number | null>(null);
  const [activeActions, setActiveActions] = useState<number | null>(null);

  const [brief, setBrief] = useState<{
    project: string; stack: string | null; focus: string | null;
    meetings: { total: number; live: number };
    decisions: { total: number; recent: { text: string; date: string | null }[] };
    actions: { active: number; items: { text: string }[] };
    open: { count: number; items: { text: string; slug: string | null }[] };
  } | null>(null);

  useEffect(() => {
    document.title = 'Agent Council';
    fetch('/api/brief')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setBrief(data);
          setMeetingCount(data.meetings?.total ?? 0);
          setActiveActions(data.actions?.active ?? 0);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;

    if (selectedAgent) {
      // Ask a specific agent — include conversation history for follow-ups
      setAskedQuestion(text);
      setPhase('thinking');
      setAnswerAgent(selectedAgent);
      try {
        // Build question with conversation history for context
        let fullQuestion = text;
        if (conversationHistory.length > 0) {
          const historyContext = conversationHistory
            .slice(-3) // Last 3 exchanges max
            .map(h => `User: ${h.question}\nAgent: ${h.answer.slice(0, 500)}`)
            .join('\n\n');
          fullQuestion = `Previous conversation:\n${historyContext}\n\nNew question: ${text}`;
        }
        const res = await fetch('/api/council/quick-consult', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: fullQuestion, agent: selectedAgent, topic: text }),
        });
        if (res.ok) {
          const data = await res.json();
          const agentAnswer = data.answer || 'No response.';
          setAnswer(agentAnswer);
          setConversationHistory(prev => [...prev, { question: text, answer: agentAnswer }]);
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
      // Build a context-rich question from the brief data
      const parts = ['Give me a daily brief.'];
      if (brief) {
        if (brief.actions.items.length > 0) {
          parts.push(`Active actions: ${brief.actions.items.map(a => a.text).join('; ')}.`);
        }
        if (brief.decisions.recent.length > 0) {
          parts.push(`Recent decisions: ${brief.decisions.recent.slice(0, 3).map(d => d.text).join('; ')}.`);
        }
        if (brief.open.items.length > 0) {
          parts.push(`Open questions: ${brief.open.items.map(o => o.text).join('; ')}.`);
        }
        parts.push('What should I focus on? What\'s at risk? Keep it concise.');
      }
      setInput(parts.join(' '));
      setSelectedAgent('project-manager');
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('[data-home-input]');
        if (el) el.form?.requestSubmit();
      }, 100);
    } else if (action === 'docs') {
      // Ask the architect to describe the current architecture
      setAskedQuestion('Document architecture');
      setPhase('thinking');
      setAnswerAgent('architect');
      fetch('/api/council/quick-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Write a brief architecture overview of this project. Cover: what it does, the main components, how they connect, key patterns used, and the tech stack. Write it as documentation someone new to the project could read. Be concise but thorough.',
          agent: 'architect',
          codeAware: true,
        }),
      })
        .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error || 'Failed'); }))
        .then(data => {
          setAnswer(data.answer || 'No response.');
          setPhase('done');
        })
        .catch(err => {
          setAnswer(`Error: ${err.message || 'Could not generate docs.'}`);
          setPhase('done');
        });
      return;
    } else if (action === 'review') {
      // Ask the developer to review recent changes
      setAskedQuestion('Review recent code changes');
      setPhase('thinking');
      setAnswerAgent('developer');
      fetch('/api/council/quick-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Review the most recent code changes in this project. What was changed? Are there any concerns — bugs, missing error handling, inconsistencies, or things that could be improved? Be specific and concise. If everything looks good, say so briefly.',
          agent: 'developer',
          codeAware: true,
        }),
      })
        .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error || 'Failed'); }))
        .then(data => {
          setAnswer(data.answer || 'No response.');
          setPhase('done');
        })
        .catch(err => {
          setAnswer(`Error: ${err.message || 'Could not get review.'}`);
          setPhase('done');
        });
      return;
    } else if (action === 'health') {
      setPhase('thinking');
      setAnswerAgent('');
      setAskedQuestion('Health check');
      fetch('/api/health-check')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.checks) {
            setAnswer('Could not run health check.');
            setPhase('done');
            return;
          }
          const icons: Record<string, string> = { good: '●', warn: '◐', bad: '○' };
          const colors: Record<string, string> = { good: 'green', warn: 'yellow', bad: 'red' };
          const lines = data.checks.map((c: { label: string; status: string; detail: string }) =>
            `- **${c.label}** ${icons[c.status] || '?'} ${c.detail}`
          );
          const overallLabel = data.overall === 'good' ? 'Healthy' : data.overall === 'warn' ? 'Needs attention' : 'Issues found';
          setAnswer(`## ${overallLabel}\n\n${lines.join('\n')}`);
          setPhase('done');
        })
        .catch(() => {
          setAnswer('Error: Could not reach the server.');
          setPhase('done');
        });
    }
  };

  const reset = () => {
    setPhase('idle');
    setInput('');
    setAnswer('');
    setAnswerAgent('');
    setSelectedAgent(null);
    setConversationHistory([]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(199, 75, 138, 0.05) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 30% 50%, rgba(212, 147, 92, 0.04) 0%, transparent 60%)' }}>
      <div style={{ maxWidth: 620, width: '100%' }}>
        {/* Header */}
        <div className="text-center mb-12">
          <h1
            className="text-4xl font-extrabold tracking-tight mb-3"
            style={{
              background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--accent-warm) 50%, var(--accent-pink) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.03em',
            }}
          >
            Agent Council
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {brief
              ? `${brief.project}${brief.stack ? ` · ${brief.stack}` : ''}`
              : meetingCount !== null
                ? `${meetingCount} meetings · ${activeActions ?? 0} active actions`
                : 'Your agent team'}
          </p>
          {brief?.focus && (
            <p className="text-xs mt-3 px-4 py-1.5 rounded-full inline-block" style={{ color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-muted)' }}>
              {brief.focus.length > 80 ? brief.focus.slice(0, 77) + '...' : brief.focus}
            </p>
          )}
        </div>

        {/* Main input */}
        {phase === 'idle' && (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
              className="mb-4"
            >
              <div
                className="flex items-center rounded-2xl overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-focus)',
                  boxShadow: 'var(--shadow-card), var(--shadow-glow-sm)',
                  backdropFilter: 'blur(20px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                }}
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
                  className="flex-1 px-5 py-4 outline-none"
                  style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: '15px' }}
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
                      background: selectedAgent === a.id ? 'var(--accent-muted)' : 'transparent',
                      color: selectedAgent === a.id ? a.color : 'var(--text-muted)',
                      border: `1px solid ${selectedAgent === a.id ? 'var(--border-glow)' : 'transparent'}`,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2.5 justify-center">
              {QUICK_ACTIONS.map(qa => (
                <button
                  key={qa.action}
                  onClick={() => qa.ready ? handleQuickAction(qa.action) : undefined}
                  disabled={!qa.ready}
                  className="text-xs px-4 py-2.5 rounded-xl transition-all duration-250 hover:scale-[1.03]"
                  style={{
                    color: qa.ready ? 'var(--text-secondary)' : 'var(--text-muted)',
                    border: `1px solid ${(qa.action === 'ask' && selectedAgent) ? 'var(--border-glow)' : qa.ready ? 'var(--border)' : 'var(--border-subtle)'}`,
                    background: (qa.action === 'ask' && selectedAgent) ? 'var(--accent-muted)' : 'var(--bg-card)',
                    opacity: qa.ready ? 1 : 0.3,
                    cursor: qa.ready ? 'pointer' : 'default',
                    backdropFilter: 'blur(12px) saturate(150%)',
                    boxShadow: qa.ready ? 'var(--shadow-sm)' : 'none',
                  }}
                  title={qa.ready ? undefined : 'Coming soon'}
                >
                  <span className="mr-1.5 opacity-60">{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>

            {/* Hint */}
            <p className="text-xs text-center mt-6" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
              {selectedAgent
                ? 'Ask a direct question — one agent responds'
                : 'Type a topic to start a meeting, or pick an agent to ask directly'}
            </p>
          </>
        )}

        {/* Thinking */}
        {phase === 'thinking' && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-1.5 mb-4">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'var(--accent)',
                    animation: `softPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {answerAgent ? `${AGENTS.find(a => a.id === answerAgent)?.label ?? answerAgent} is thinking...` : 'Starting meeting...'}
            </p>
          </div>
        )}

        {/* Response */}
        {phase === 'done' && (
          <div>
            {/* Previous exchanges (if follow-up conversation) */}
            {conversationHistory.length > 1 && (
              <div className="space-y-2 mb-3 opacity-60">
                {conversationHistory.slice(0, -1).map((h, i) => (
                  <div key={i}>
                    <div className="text-xs px-3 py-1.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                      {h.question.slice(0, 80)}{h.question.length > 80 ? '...' : ''}
                    </div>
                    <div className="text-xs px-3 py-1.5 mt-1" style={{ color: 'var(--text-muted)' }}>
                      {h.answer.slice(0, 120)}{h.answer.length > 120 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Current question */}
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
              className="rounded-2xl p-5 text-sm leading-relaxed mb-5 prose prose-sm prose-invert max-w-none"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                boxShadow: 'var(--shadow-card)',
                backdropFilter: 'blur(16px) saturate(150%)',
                WebkitBackdropFilter: 'blur(16px) saturate(150%)',
              }}
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
