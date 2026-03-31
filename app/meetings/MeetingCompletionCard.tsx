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
  onDismissCard?: () => void;
}

const OUTCOME_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

function extractFromJSON(content: string): { decisions: string[]; actions: string[]; open: string[] } | null {
  const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n(?:meeting-outcomes\s*)?-->/);
  if (!jsonMatch) return null;
  try {
    const data = JSON.parse(jsonMatch[1]);
    if (!data.schema_version) return null;
    const decisions = (data.decisions ?? []).map((d: string | { text: string; rationale?: string }) =>
      typeof d === 'string' ? d : d.text + (d.rationale ? ` — ${d.rationale}` : '')
    ).filter(Boolean);
    const actions = (data.actions ?? []).map((a: string | { text: string }) =>
      typeof a === 'string' ? a : a.text
    ).filter(Boolean);
    const resolvedSlugs = new Set((data.resolved ?? []).map((r: { slug: string }) => r.slug));
    const open = (data.open_questions ?? [])
      .map((o: string | { slug?: string; text: string }) => {
        const text = typeof o === 'string' ? o : o.text;
        const slug = typeof o === 'string' ? null : (o.slug ?? null);
        return { slug, text };
      })
      .filter((o: { slug: string | null; text: string }) => o.text && (!o.slug || !resolvedSlugs.has(o.slug)))
      .map((o: { text: string }) => o.text);
    return { decisions, actions, open };
  } catch {
    return null;
  }
}

function extractFromSummary(content: string) {
  // Try JSON appendix first (preferred — recent meetings use this)
  const jsonResult = extractFromJSON(content);
  if (jsonResult && (jsonResult.decisions.length + jsonResult.actions.length + jsonResult.open.length) > 0) {
    return {
      decisions: jsonResult.decisions.slice(0, 3),
      actions: jsonResult.actions.slice(0, 3),
      open: jsonResult.open.slice(0, 2),
      overflow: {
        decisions: Math.max(0, jsonResult.decisions.length - 3),
        actions: Math.max(0, jsonResult.actions.length - 3),
        open: Math.max(0, jsonResult.open.length - 2),
      },
    };
  }

  // Fallback: inline tag parsing for older meetings
  const lines = content.split('\n');
  const summaryIdx = lines.findIndex(l => l.trim() === '## Summary');
  const start = summaryIdx >= 0 ? summaryIdx : 0;

  const decisions: string[] = [];
  const actions: string[] = [];
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
    if (type === 'ACTION') actions.push(text);
    if (type === 'OPEN') open.push({ slug, text });
  }

  const filteredOpen = open
    .filter(item => !item.slug || !resolvedSlugs.has(item.slug))
    .map(item => item.text);

  const totalDecisions = decisions.length;
  const totalActions = actions.length;
  const totalOpen = filteredOpen.length;

  return {
    decisions: decisions.slice(0, 3),
    actions: actions.slice(0, 3),
    open: filteredOpen.slice(0, 2),
    overflow: {
      decisions: Math.max(0, totalDecisions - 3),
      actions: Math.max(0, totalActions - 3),
      open: Math.max(0, totalOpen - 2),
    },
  };
}

function analyzeQuality(actions: string[], decisions: string[]): { total: number; issues: string[] } {
  const issues: string[] = [];
  const noRole = actions.filter(a => !/@\w+/.test(a)).length;
  const noDoneWhen = actions.filter(a => !/done when[:\s]/i.test(a)).length;
  const noRationale = decisions.filter(d => !/because[:\s]/i.test(d)).length;
  if (noRole > 0) issues.push(`${noRole} action${noRole > 1 ? 's' : ''} missing @role`);
  if (noDoneWhen > 0) issues.push(`${noDoneWhen} action${noDoneWhen > 1 ? 's' : ''} missing "done when:"`);
  if (noRationale > 0) issues.push(`${noRationale} decision${noRationale > 1 ? 's' : ''} missing rationale`);
  return { total: noRole + noDoneWhen + noRationale, issues };
}

export default function MeetingCompletionCard({ content, recommendedMeetings, dismissedSuggestions, queuedSuggestions, onQueue, onDismiss, onDismissCard }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { decisions, actions, open, overflow } = useMemo(() => extractFromSummary(content), [content]);
  const activeSuggestions = useMemo(
    () => (recommendedMeetings ?? []).filter(r => !dismissedSuggestions.has(r.text)).slice(0, 2),
    [recommendedMeetings, dismissedSuggestions]
  );

  // Build compact count summary for the header
  const totalDecisions = decisions.length + overflow.decisions;
  const totalActions = actions.length + overflow.actions;
  const totalOpen = open.length + overflow.open;
  const countParts: string[] = [];
  if (totalDecisions > 0) countParts.push(`${totalDecisions} decision${totalDecisions > 1 ? 's' : ''}`);
  if (totalActions > 0) countParts.push(`${totalActions} action${totalActions > 1 ? 's' : ''}`);
  if (totalOpen > 0) countParts.push(`${totalOpen} open`);
  const countSummary = countParts.length > 0 ? countParts.join(' · ') : null;

  // Quality analysis — check ALL outcomes (full lists, not sliced)
  const quality = useMemo(() => {
    const jsonResult = extractFromJSON(content);
    const fullActions = jsonResult?.actions ?? actions;
    const fullDecisions = jsonResult?.decisions ?? decisions;
    return analyzeQuality(fullActions, fullDecisions);
  }, [content, actions, decisions]);

  const hasContent = decisions.length > 0 || actions.length > 0 || open.length > 0 || activeSuggestions.length > 0;

  // Fallback: no extracted outcomes — show a simple "complete" line instead of nothing
  if (!hasContent) {
    return (
      <div
        className="mx-6 mt-4 mb-2 rounded-xl text-sm px-4 py-2.5 flex items-center gap-2"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <span className="text-xs" style={{ color: 'var(--color-decision)' }}>{'\u2714'}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Meeting complete — scroll up to view full outcomes</span>
        {onDismissCard && (
          <button onClick={onDismissCard} className="ml-auto text-xs px-1 hover:brightness-125 transition-colors" style={{ color: 'var(--text-muted)' }} title="Dismiss">✕</button>
        )}
      </div>
    );
  }

  return (
    <div
      className="mx-6 mt-4 mb-2 rounded-xl text-sm overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      {/* Header with outcome counts */}
      <div className="flex items-center" style={{ borderBottom: expanded ? '1px solid var(--border-subtle)' : undefined }}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 px-4 py-2.5 flex items-center gap-2 cursor-pointer hover:brightness-110 transition-colors text-left"
        >
          <span className="text-xs font-medium" style={{ color: 'var(--live-green)' }}>{'\u2714'} Meeting complete</span>
          {countSummary && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— {countSummary}</span>}
          <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{expanded ? '▾' : '▸'}</span>
        </button>
        {onDismissCard && (
          <button onClick={onDismissCard} className="px-3 py-2.5 text-xs hover:brightness-125 transition-colors" style={{ color: 'var(--text-muted)' }} title="Dismiss card">✕</button>
        )}
      </div>

      {expanded && <div className="px-4 py-3 space-y-3">
        {/* Decisions */}
        {decisions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-decision)' }}>Decisions</div>
            <ul className="space-y-1">
              {decisions.map((d, i) => (
                <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-decision)', flexShrink: 0 }}>·</span>
                  <span>{renderInline(d)}</span>
                </li>
              ))}
              {overflow.decisions > 0 && (
                <li className="text-xs" style={{ color: 'var(--text-muted)', paddingLeft: '0.75rem' }}>
                  …and {overflow.decisions} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Action items */}
        {actions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-action)' }}>Actions</div>
            <ul className="space-y-1">
              {actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-action)', flexShrink: 0 }}>·</span>
                  <span>{renderInline(a)}</span>
                </li>
              ))}
              {overflow.actions > 0 && (
                <li className="text-xs" style={{ color: 'var(--text-muted)', paddingLeft: '0.75rem' }}>
                  …and {overflow.actions} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Open questions */}
        {open.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-open)' }}>Still open</div>
            <ul className="space-y-1">
              {open.map((q, i) => (
                <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-open)', flexShrink: 0 }}>·</span>
                  <span>{renderInline(q)}</span>
                </li>
              ))}
              {overflow.open > 0 && (
                <li className="text-xs" style={{ color: 'var(--text-muted)', paddingLeft: '0.75rem' }}>
                  …and {overflow.open} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Suggested next meetings */}
        {activeSuggestions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-suggestion)' }}>Suggested next</div>
            <div className="flex flex-wrap gap-2">
              {activeSuggestions.map((s, i) => {
                const isQueued = queuedSuggestions.has(s.text);
                return (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => { if (!isQueued) onQueue(s.type ?? 'strategy-session', s.topic ?? s.text, s.text); }}
                    className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:brightness-110"
                    style={{
                      background: isQueued ? 'var(--bg-elevated)' : 'var(--accent-muted)',
                      color: isQueued ? 'var(--text-muted)' : 'var(--accent)',
                      border: '1px solid var(--border-glow)',
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

        {/* Quality warnings */}
        {quality.total > 0 && (
          <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-open)' }}>Quality ({quality.total} issue{quality.total > 1 ? 's' : ''})</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {quality.issues.join(' · ')}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
