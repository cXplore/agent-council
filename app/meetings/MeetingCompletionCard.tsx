'use client';

import { useMemo, useState } from 'react';
import type { SuggestedMeeting } from '@/lib/types';
import { renderInline } from './render-inline';

interface Props {
  content: string;
  recommendedMeetings?: SuggestedMeeting[];
  dismissedSuggestions: Set<string>;
  queuedSuggestions: Set<string>;
  onQueue: (type: string, topic: string, text: string) => void;
  onDismiss: (text: string) => void;
}

const OUTCOME_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

function extractFromSummary(content: string) {
  const lines = content.split('\n');
  const summaryIdx = lines.findIndex(l => l.trim() === '## Summary');
  const start = summaryIdx >= 0 ? summaryIdx : 0;

  const decisions: string[] = [];
  const open: { slug: string | null; text: string }[] = [];
  const resolvedSlugs = new Set<string>();

  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(OUTCOME_REGEX);
    if (!m) continue;
    const type = m[1].toUpperCase();
    const slug = m[2]?.toLowerCase() ?? null;
    const text = m[3].trim();
    if (type === 'RESOLVED' && slug) resolvedSlugs.add(slug);
    if (type === 'DECISION') decisions.push(text);
    if (type === 'OPEN') open.push({ slug, text });
  }

  // Suppress open items that were resolved in the same meeting (match by slug)
  const filteredOpen = open
    .filter(item => !item.slug || !resolvedSlugs.has(item.slug))
    .map(item => item.text);

  return { decisions: decisions.slice(0, 3), open: filteredOpen.slice(0, 2) };
}

export default function MeetingCompletionCard({ content, recommendedMeetings, dismissedSuggestions, queuedSuggestions, onQueue, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(true);
  const { decisions, open } = useMemo(() => extractFromSummary(content), [content]);
  const activeSuggestions = useMemo(
    () => (recommendedMeetings ?? []).filter(r => !dismissedSuggestions.has(r.text)).slice(0, 2),
    [recommendedMeetings, dismissedSuggestions]
  );

  const hasContent = decisions.length > 0 || open.length > 0 || activeSuggestions.length > 0;
  if (!hasContent) return null;

  return (
    <div
      className="mx-6 mt-4 mb-2 rounded-xl text-sm overflow-hidden"
      style={{ border: '1px solid rgba(96, 165, 250, 0.25)', background: 'rgba(96, 165, 250, 0.04)' }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-2.5 flex items-center gap-2 cursor-pointer hover:brightness-110 transition-colors"
        style={{ borderBottom: expanded ? '1px solid rgba(96, 165, 250, 0.15)' : undefined, background: 'rgba(96, 165, 250, 0.06)' }}
      >
        <span className="text-xs font-medium" style={{ color: '#60a5fa' }}>Meeting complete</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— here&apos;s what was decided</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && <div className="px-4 py-3 space-y-3">
        {/* Decisions */}
        {decisions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#60a5fa' }}>Decisions</div>
            <ul className="space-y-1">
              {decisions.map((d, i) => (
                <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#60a5fa', flexShrink: 0 }}>·</span>
                  <span>{renderInline(d)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Open questions */}
        {open.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#fbbf24' }}>Still open</div>
            <ul className="space-y-1">
              {open.map((q, i) => (
                <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#fbbf24', flexShrink: 0 }}>·</span>
                  <span>{renderInline(q)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested next meetings */}
        {activeSuggestions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#a78bfa' }}>Suggested next</div>
            <div className="flex flex-wrap gap-2">
              {activeSuggestions.map((s, i) => {
                const isQueued = queuedSuggestions.has(s.text);
                return (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => { if (!isQueued) onQueue(s.type ?? 'strategy-session', s.topic ?? s.text, s.text); }}
                    className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:brightness-110"
                    style={{
                      background: isQueued ? 'var(--bg-elevated)' : 'rgba(167,139,250,0.12)',
                      color: isQueued ? 'var(--text-muted)' : '#a78bfa',
                      border: '1px solid rgba(167,139,250,0.3)',
                      textDecoration: isQueued ? 'line-through' : undefined,
                      cursor: isQueued ? 'default' : undefined,
                    }}
                  >
                    {isQueued ? '✓ ' : '+ '}{s.text.replace(/\*\*/g, '')}
                  </button>
                  {!isQueued && (
                    <button
                      onClick={() => onDismiss(s.text)}
                      className="text-xs px-1 py-1 rounded transition-colors hover:brightness-110"
                      style={{ color: 'var(--text-muted)' }}
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
