'use client';

import { useMemo } from 'react';

const OUTCOME_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

const TYPE_BADGES = {
  DECISION: { label: 'decisions', color: 'var(--color-decision)', bg: 'var(--color-decision-bg)' },
  OPEN: { label: 'open', color: 'var(--color-open)', bg: 'var(--color-open-bg)' },
  ACTION: { label: 'actions', color: 'var(--color-action)', bg: 'var(--color-action-bg)' },
} as const;

/** Extract the prose from the ## Summary section (first 3 sentences). */
function extractSummaryProse(content: string): string | null {
  const match = content.match(/^##\s+Summary\s*\n([\s\S]*?)(?=^##\s|\z)/m);
  if (!match) return null;

  // Get the prose text before any outcome tags
  const prose = match[1]
    .split('\n')
    .filter(line => line.trim() && !OUTCOME_REGEX.test(line) && !line.startsWith('#'))
    .join(' ')
    .trim();

  if (!prose) return null;

  // Take first 3 sentences
  const sentences = prose.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return prose.slice(0, 200);
  return sentences.slice(0, 3).join(' ').trim();
}

/** Count outcomes by type, suppressing OPEN items resolved by RESOLVED tags. */
function countByType(content: string): Record<string, number> {
  const summaryIdx = content.search(/^##\s+Summary\s*$/m);
  const lines = summaryIdx > 0 ? content.slice(summaryIdx).split('\n') : content.split('\n');

  const counts: Record<string, number> = { DECISION: 0, OPEN: 0, ACTION: 0 };
  const resolvedSlugs = new Set<string>();

  // First pass: collect resolved slugs
  for (const line of lines) {
    const m = line.match(OUTCOME_REGEX);
    if (m && m[1].toUpperCase() === 'RESOLVED' && m[2]) {
      resolvedSlugs.add(m[2].toLowerCase());
    }
  }

  // Second pass: count, suppressing resolved opens
  for (const line of lines) {
    const m = line.match(OUTCOME_REGEX);
    if (!m) continue;
    const type = m[1].toUpperCase();
    if (type === 'RESOLVED') continue;
    if (type === 'OPEN' && m[2] && resolvedSlugs.has(m[2].toLowerCase())) continue;
    if (type in counts) counts[type]++;
  }

  return counts;
}

interface MeetingSummaryCardProps {
  content: string;
  onOpenOutcomes: () => void;
}

export default function MeetingSummaryCard({ content, onOpenOutcomes }: MeetingSummaryCardProps) {
  const prose = useMemo(() => extractSummaryProse(content), [content]);
  const counts = useMemo(() => countByType(content), [content]);

  const totalOutcomes = counts.DECISION + counts.OPEN + counts.ACTION;
  if (!prose && totalOutcomes === 0) return null;

  return (
    <div
      className="mx-6 mt-4 mb-2 rounded-lg"
      style={{
        background: 'var(--bg-card, rgba(30, 30, 30, 0.5))',
        borderLeft: '3px solid rgba(96, 165, 250, 0.4)',
        padding: '12px 16px',
      }}
    >
      {prose && (
        <p
          className="text-sm leading-relaxed mb-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {prose}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(Object.entries(TYPE_BADGES) as [keyof typeof TYPE_BADGES, typeof TYPE_BADGES[keyof typeof TYPE_BADGES]][]).map(
          ([type, cfg]) => {
            const count = counts[type] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={type}
                onClick={onOpenOutcomes}
                className="text-xs px-2 py-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-80"
                style={{ background: cfg.bg, color: cfg.color, border: 'none' }}
                title={`View ${cfg.label} in outcomes panel`}
              >
                {count} {cfg.label}
              </button>
            );
          },
        )}
        {totalOutcomes > 0 && (
          <button
            onClick={onOpenOutcomes}
            className="text-xs ml-auto cursor-pointer hover:underline"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0 }}
          >
            View all outcomes &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
