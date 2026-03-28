import React from 'react';
import type { Components } from 'react-markdown';

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  DECISION: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60a5fa' },
  OPEN: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24' },
  ACTION: { bg: 'rgba(74, 222, 128, 0.15)', text: '#4ade80' },
  RESOLVED: { bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280' },
  IDEA: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7' },
};

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (React.isValidElement(children)) {
    const props = children.props as Record<string, unknown>;
    if (props.children) return extractText(props.children as React.ReactNode);
  }
  return '';
}

function renderTaggedContent(children: React.ReactNode): React.ReactNode {
  const text = extractText(children);
  // Match DECISION/OPEN/ACTION/RESOLVED tags at start of line (with optional brackets and slug IDs)
  const tagMatch = text.match(/^\s*\[?(DECISION|OPEN|ACTION|RESOLVED|IDEA)(?::[\w-]+)?[:\]]\s*/i);
  if (!tagMatch) return null;

  const tagType = tagMatch[1].toUpperCase();
  const normalizedType = tagType.startsWith('ACTION') ? 'ACTION' : tagType;
  const c = TAG_COLORS[normalizedType] || TAG_COLORS.DECISION;
  const rest = text.replace(/^\s*\[?(DECISION|OPEN|ACTION|RESOLVED|IDEA)(?::[\w-]+)?[:\]]\s*/i, '');
  const isResolved = normalizedType === 'RESOLVED';

  return (
    <>
      <span
        className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
        style={{ background: c.bg, color: c.text, display: 'inline-block', marginRight: 6 }}
      >
        {normalizedType}
      </span>
      {isResolved ? <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{rest}</span> : rest}
    </>
  );
}

/**
 * Shared markdown rendering components for the dark theme.
 * Use `mdComponents` for meetings (agent names colored),
 * use `docComponents` for static docs (agent names plain).
 */

const baseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold mt-6 mb-3" style={{ color: 'var(--accent)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-4 mb-2" style={{ color: 'var(--text-primary)' }}>
      {children}
    </h3>
  ),
  p: ({ children }) => {
    const tagged = renderTaggedContent(children);
    if (tagged) {
      return (
        <p className="mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {tagged}
        </p>
      );
    }
    return (
      <p className="mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </p>
    );
  },
  ul: ({ children }) => (
    <ul className="list-disc list-inside mb-3 space-y-1" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside mb-3 space-y-1" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </ol>
  ),
  li: ({ children }) => {
    const tagged = renderTaggedContent(children);
    if (tagged) return <li className="leading-relaxed">{tagged}</li>;
    return <li className="leading-relaxed">{children}</li>;
  },
  hr: () => (
    <hr className="my-4" style={{ borderColor: 'var(--border)' }} />
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="pl-4 my-4 italic"
      style={{ borderLeft: '2px solid var(--accent)', color: 'var(--text-muted)' }}
    >
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre
      className="text-xs p-4 rounded-lg my-3 overflow-x-auto"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)', lineHeight: 1.6 }}
    >
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code
      className="text-xs px-1.5 py-0.5 rounded"
      style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}
    >
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      className="text-left px-3 py-2 text-xs font-medium"
      style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className="px-3 py-2 text-xs"
      style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      {children}
    </td>
  ),
  input: ({ checked, ...props }) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-2"
      {...props}
    />
  ),
};

/** For document/agent views — plain strong text */
export const docComponents: Components = {
  ...baseComponents,
  strong: ({ children }) => (
    <strong style={{ color: 'var(--text-primary)' }}>{children}</strong>
  ),
};

/**
 * Create meeting components with agent-colored strong text.
 * Pass getAgentColor to avoid circular dependency.
 */
export function createMeetingComponents(getAgentColor: (name: string) => string): Components {
  return {
    ...baseComponents,
    h1: ({ children }) => (
      <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-lg font-semibold mt-8 mb-4" style={{ color: 'var(--accent)' }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base font-semibold mt-6 mb-3" style={{ color: 'var(--text-primary)' }}>
        {children}
      </h3>
    ),
    hr: () => (
      <hr className="my-8" style={{ borderColor: 'var(--border)', opacity: 0.6 }} />
    ),
    strong: ({ children }) => {
      const name = String(children).replace(/:$/, '');
      const color = getAgentColor(name);
      // Agent names (ending with :) get a colored badge-style header with link to profile
      const isAgentName = String(children).endsWith(':');
      if (isAgentName) {
        return (
          <strong style={{
            display: 'block',
            marginTop: 24,
            marginBottom: 4,
            paddingLeft: 12,
            borderLeft: `3px solid ${color}`,
            color,
            fontSize: '0.9rem',
            fontWeight: 600,
          }}>
            <a
              href={`/agents?agent=${encodeURIComponent(name)}`}
              className="hover:underline focus-visible:underline"
              style={{ color: 'inherit', textDecoration: 'none' }}
              title={`View ${name} agent profile`}
            >
              {children}
            </a>
          </strong>
        );
      }
      return (
        <strong style={{ color }}>
          {children}
        </strong>
      );
    },
  };
}
