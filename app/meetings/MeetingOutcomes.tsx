'use client';

import { useMemo, useState } from 'react';
import { renderInline } from './render-inline';

interface OutcomeItem {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED';
  text: string;
  id: string | null;
  lineIndex: number;
}

const TYPE_CONFIG = {
  DECISION: { label: 'Decisions', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.4)' },
  OPEN: { label: 'Open Questions', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.4)' },
  ACTION: { label: 'Actions', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.4)' },
  RESOLVED: { label: 'Resolved', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)', border: 'rgba(107, 114, 128, 0.3)' },
};

const OUTCOME_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

function extractOutcomes(content: string): OutcomeItem[] {
  const items: OutcomeItem[] = [];

  // If a Summary section exists, use only that to avoid duplicating inline tags
  // that get restated in the canonical summary.
  const summaryIdx = content.search(/^##\s+Summary\s*$/m);
  const allLines = content.split('\n');
  const startLine = summaryIdx > 0
    ? content.slice(0, summaryIdx).split('\n').length - 1
    : 0;
  const lines = summaryIdx > 0 ? content.slice(summaryIdx).split('\n') : allLines;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(OUTCOME_REGEX);
    if (match) {
      const type = match[1].toUpperCase() as OutcomeItem['type'];
      items.push({
        type,
        id: match[2]?.toLowerCase() ?? null,
        text: match[3].trim(),
        lineIndex: startLine + i,
      });
    }
  }

  return items;
}

interface MeetingOutcomesProps {
  content: string;
  open: boolean;
  onClose: () => void;
}

export default function MeetingOutcomes({ content, open, onClose }: MeetingOutcomesProps) {
  const [notFoundKey, setNotFoundKey] = useState<string | null>(null);
  const outcomes = useMemo(() => extractOutcomes(content), [content]);

  const grouped = useMemo(() => {
    const groups: Record<string, OutcomeItem[]> = { DECISION: [], OPEN: [], ACTION: [], RESOLVED: [] };
    const resolvedSlugs = new Set(
      outcomes.filter(o => o.type === 'RESOLVED' && o.id).map(o => o.id!)
    );
    for (const item of outcomes) {
      if (item.type === 'OPEN' && item.id && resolvedSlugs.has(item.id)) continue; // suppress resolved opens
      groups[item.type]?.push(item);
    }
    return groups;
  }, [outcomes]);

  const total = outcomes.length;

  if (!open) return null;

  const highlightEl = (el: HTMLElement) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '2px solid rgba(96, 165, 250, 0.4)';
    el.style.outlineOffset = '4px';
    el.style.borderRadius = '4px';
    setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 2000);
  };

  const handleScrollTo = (item: OutcomeItem) => {
    const container = document.querySelector('.meeting-content, .meeting-new-content, .prose');
    if (!container) return;

    // Strategy 1: Find rendered tag badges (DECISION/OPEN/ACTION spans) and match parent text
    const badges = container.querySelectorAll('span');
    // Strip markdown formatting (backticks, bold markers) for DOM text matching
    const searchText = item.text.replace(/[`*_~]/g, '').slice(0, 30).toLowerCase();
    for (const badge of badges) {
      if (badge.textContent?.trim() === item.type) {
        const parent = badge.parentElement;
        if (parent?.textContent?.toLowerCase().includes(searchText)) {
          highlightEl(parent as HTMLElement);
          return;
        }
      }
    }

    // Strategy 2: Fall back to text search in paragraphs and list items
    const candidates = container.querySelectorAll('p, li');
    for (const el of candidates) {
      if (el.textContent?.toLowerCase().includes(searchText)) {
        highlightEl(el as HTMLElement);
        return;
      }
    }

    // Nothing found — show inline feedback
    const key = `${item.type}-${item.lineIndex}`;
    setNotFoundKey(key);
    setTimeout(() => setNotFoundKey(null), 3000);
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        width: 320,
        minWidth: 320,
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Outcomes
          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {total} item{total !== 1 ? 's' : ''}
          </span>
        </span>
        <button
          onClick={onClose}
          className="text-xs px-1.5 py-0.5 rounded hover:brightness-125 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Close outcomes panel"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {total === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            No tagged outcomes found in this meeting.
            <br />
            <span className="mt-1 block">
              Agents tag items with <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', color: '#60a5fa' }}>DECISION:</code>{' '}
              <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', color: '#fbbf24' }}>OPEN:</code>{' '}
              <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)', color: '#4ade80' }}>ACTION:</code>
            </span>
          </p>
        ) : (
          (['DECISION', 'OPEN', 'ACTION', 'RESOLVED'] as const).map(type => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const config = TYPE_CONFIG[type];

            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: config.color }}
                  >
                    {config.label}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: config.bg, color: config.color }}
                  >
                    {items.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map((item, i) => (
                    <button
                      key={`${type}-${i}`}
                      onClick={() => handleScrollTo(item)}
                      className="w-full text-left rounded-lg px-3 py-2 text-sm transition-colors hover:brightness-110 cursor-pointer"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: type === 'RESOLVED' ? 'var(--text-muted)' : 'var(--text-secondary)',
                        borderLeft: `2px solid ${config.border}`,
                        opacity: type === 'RESOLVED' ? 0.7 : 1,
                      }}
                      title="Click to scroll to context"
                    >
                      <span className={`line-clamp-2${type === 'RESOLVED' ? ' line-through' : ''}`}>{renderInline(item.text)}</span>
                      {notFoundKey === `${item.type}-${item.lineIndex}` && (
                        <span className="block text-xs mt-1 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                          not found in view
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Export the visible count for the toggle button — excludes OPEN items suppressed by matching RESOLVED
export function countOutcomes(content: string): number {
  const items = extractOutcomes(content);
  const resolvedSlugs = new Set(
    items.filter(o => o.type === 'RESOLVED' && o.id).map(o => o.id!)
  );
  return items.filter(item => !(item.type === 'OPEN' && item.id && resolvedSlugs.has(item.id))).length;
}
