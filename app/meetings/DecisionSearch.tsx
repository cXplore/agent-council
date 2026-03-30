'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { renderInline } from './render-inline';

interface RecallResult {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED';
  text: string;
  meeting: string;
  meetingTitle: string;
  meetingStatus: string;
  date: string | null;
  score: number;
  context?: string;
}

interface DecisionSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSelectMeeting: (filename: string, highlightText?: string) => void;
  projectParam: (extra?: string) => string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  DECISION: { label: 'Decision', color: 'var(--color-decision)', bgColor: 'var(--color-decision-bg, rgba(74,222,128,0.15))' },
  ACTION: { label: 'Action', color: 'var(--color-action)', bgColor: 'var(--color-action-bg, rgba(96,165,250,0.15))' },
  OPEN: { label: 'Open', color: 'var(--color-open)', bgColor: 'var(--color-open-bg, rgba(251,191,36,0.15))' },
  RESOLVED: { label: 'Resolved', color: 'var(--text-muted)', bgColor: 'rgba(128,128,128,0.1)' },
};

export default function DecisionSearch({ query, onQueryChange, onSelectMeeting, projectParam }: DecisionSearchProps) {
  const [results, setResults] = useState<RecallResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    try {
      const typesParam = typeFilter ? `&types=${typeFilter.toLowerCase()}` : '';
      const res = await fetch(`/api/meetings/tags?mode=recall&q=${encodeURIComponent(q.trim())}${typesParam}${projectParam('&')}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch {
      // silently fail
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  }, [typeFilter, projectParam]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Re-search when type filter changes
  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredResults = typeFilter
    ? results.filter(r => r.type === typeFilter)
    : results;

  // Count by type for filter chips
  const typeCounts: Record<string, number> = {};
  for (const r of results) {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  }

  return (
    <div className="space-y-3">
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search decisions, actions, and open questions..."
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--accent)',
          color: 'var(--text-primary)',
        }}
      />

      {/* Type filter chips (only show when we have results) */}
      {results.length > 0 && Object.keys(typeCounts).length > 1 && (
        <div className="flex gap-1.5">
          <button
            onClick={() => setTypeFilter(null)}
            className="text-xs px-2.5 py-0.5 rounded-full transition-colors"
            style={{
              background: !typeFilter ? 'var(--accent-muted)' : 'transparent',
              color: !typeFilter ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${!typeFilter ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            All {results.length}
          </button>
          {Object.entries(typeCounts).map(([type, count]) => {
            const config = TYPE_CONFIG[type];
            if (!config) return null;
            const active = typeFilter === type;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(active ? null : type)}
                className="text-xs px-2.5 py-0.5 rounded-full transition-colors"
                style={{
                  background: active ? config.bgColor : 'transparent',
                  color: active ? config.color : 'var(--text-muted)',
                  border: `1px solid ${active ? config.color + '66' : 'var(--border)'}`,
                }}
              >
                {config.label} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {searching && (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          Searching...
        </div>
      )}

      {!searching && hasSearched && filteredResults.length === 0 && (
        <div className="rounded-lg p-6 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            No results for &ldquo;{query}&rdquo;
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Try different keywords. The search matches against tagged decisions, actions, and open questions from meeting outcomes.
          </p>
        </div>
      )}

      {!searching && filteredResults.length > 0 && (
        <div className="space-y-2">
          {filteredResults.map((r, i) => {
            const config = TYPE_CONFIG[r.type] || TYPE_CONFIG.DECISION;
            return (
              <button
                key={`${r.meeting}-${r.type}-${i}`}
                onClick={() => onSelectMeeting(r.meeting.replace(/.*[\\/]/, ''), r.text.split(' — ')[0])}
                className="block w-full text-left rounded-lg px-4 py-3 transition-colors hover:brightness-110"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
              >
                {/* Type badge + text */}
                <div className="flex items-start gap-2">
                  <span
                    className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                    style={{ background: config.bgColor, color: config.color }}
                  >
                    {config.label}
                  </span>
                  <span className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {renderInline(r.text.split(' — ')[0])}
                  </span>
                </div>
                {/* Rationale if present (after the em dash) */}
                {r.text.includes(' — ') && (
                  <p className="text-xs mt-1.5 ml-[calc(theme(spacing.2)+3.5rem)]" style={{ color: 'var(--text-muted)' }}>
                    {r.text.split(' — ').slice(1).join(' — ')}
                  </p>
                )}
                {/* Provenance: meeting title + date */}
                <div className="flex items-center gap-1.5 mt-2 ml-[calc(theme(spacing.2)+3.5rem)]">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {r.meetingTitle?.replace(/^(Design Review|Strategy Session|Architecture Review|Retrospective|Sprint Planning|Incident Review|Standup):\s*/i, '') || r.meeting.replace(/.*[\\/]/, '').replace(/\.md$/, '')}
                  </span>
                  {r.date && (
                    <>
                      <span style={{ color: 'var(--text-muted)', fontSize: '8px' }}>&bull;</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.date}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state — no query yet */}
      {!searching && !hasSearched && !query && (
        <div className="rounded-lg p-6 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Search across all meeting outcomes
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Try &ldquo;caching&rdquo;, &ldquo;auth&rdquo;, &ldquo;architecture&rdquo;, or any topic
          </p>
        </div>
      )}
    </div>
  );
}
