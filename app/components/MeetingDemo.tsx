'use client';

import { useState, useEffect, useRef } from 'react';

const AGENT_COLORS: Record<string, string> = {
  'project-manager': 'hsl(200, 70%, 65%)',
  'critic': 'hsl(0, 65%, 65%)',
  'north-star': 'hsl(270, 65%, 70%)',
  'architect': 'hsl(160, 55%, 60%)',
};

interface Message {
  agent: string;
  text: string;
  delay: number; // ms after previous
}

const MESSAGES: Message[] = [
  {
    agent: 'project-manager',
    delay: 800,
    text: 'We have 12 endpoints currently, all REST. Migration cost to GraphQL would be significant — roughly 2 weeks. The question is whether the flexibility justifies the investment.',
  },
  {
    agent: 'critic',
    delay: 1200,
    text: 'GraphQL solves a problem we don\'t have yet. With 12 endpoints, REST is fine. The real risk is adding complexity for theoretical future benefits.',
  },
  {
    agent: 'north-star',
    delay: 1400,
    text: 'The question isn\'t "do we need it today" — it\'s "will our API needs grow in ways that make REST painful?" If we\'re building toward mobile or third-party integrations, GraphQL becomes compelling.',
  },
  {
    agent: 'architect',
    delay: 1600,
    text: 'This is a reversibility question. My recommendation: stay REST, but design endpoints with future composition in mind. If we hit 30+ endpoints, revisit.',
  },
];

export default function MeetingDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTriggered = useRef(false);

  // Start animation when component scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTriggered.current) {
          hasTriggered.current = true;
          setStarted(true);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Stagger message appearances
  useEffect(() => {
    if (!started || visibleCount >= MESSAGES.length) return;
    const nextDelay = MESSAGES[visibleCount].delay;
    const timer = setTimeout(() => setVisibleCount(c => c + 1), nextDelay);
    return () => clearTimeout(timer);
  }, [started, visibleCount]);

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto px-6 pb-16">
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Fake header bar */}
        <div
          className="px-4 py-2.5 flex items-center gap-3"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse"
            style={{ background: 'var(--live-green)' }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--live-green)' }}>LIVE</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Strategy Session — API Architecture
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {Object.entries(AGENT_COLORS).map(([name, color]) => (
              <span
                key={name}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ color, background: `${color.replace(')', ', 0.12)').replace('hsl(', 'hsla(')}` }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div
          className="px-5 py-4 space-y-4"
          style={{ background: 'var(--bg-card)', minHeight: 200 }}
        >
          {MESSAGES.slice(0, visibleCount).map((msg, i) => (
            <div
              key={i}
              className="text-sm leading-relaxed"
              style={{
                color: 'var(--text-secondary)',
                animation: 'fadeSlideIn 0.5s ease-out both',
              }}
            >
              <strong style={{ color: AGENT_COLORS[msg.agent] }}>{msg.agent}:</strong>{' '}
              {msg.text}
            </div>
          ))}

          {/* Deliberating indicator */}
          {started && visibleCount < MESSAGES.length && (
            <div className="flex items-center gap-2 pt-1">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: 'var(--accent)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Agents deliberating...
              </span>
            </div>
          )}

          {/* Completed state */}
          {visibleCount >= MESSAGES.length && (
            <div className="flex items-center gap-2 pt-1" style={{ animation: 'fadeSlideIn 0.5s ease-out both' }}>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--live-green)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                New response received
              </span>
            </div>
          )}
        </div>

        {/* Fake chat input */}
        <div
          className="px-4 py-2.5 flex items-center gap-3"
          style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}
        >
          <div
            className="flex-1 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Write into the meeting...
          </div>
          <div
            className="px-4 py-2 rounded-lg text-xs font-medium opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            Send
          </div>
        </div>
      </div>
    </div>
  );
}
