'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Command {
  label: string;
  href: string;
  shortcut?: string;
}

const COMMANDS: Command[] = [
  { label: 'Meetings', href: '/meetings', shortcut: 'M' },
  { label: 'Dashboard', href: '/dashboard', shortcut: 'D' },
  { label: 'Agents', href: '/agents', shortcut: 'A' },
  { label: 'Setup', href: '/setup', shortcut: 'S' },
  { label: 'Settings', href: '/settings' },
  { label: 'Guide', href: '/guide', shortcut: 'G' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = query
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : COMMANDS;

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Global keyboard listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened, clear state when closed
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay to ensure the DOM has rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        navigate(filtered[selectedIndex].href);
      }
    }
  }, [filtered, selectedIndex, navigate]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          margin: '0 16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ padding: 4, maxHeight: 300, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '12px 16px',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              No results
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const isSelected = i === selectedIndex;
              // Highlight matching text
              const matchStart = cmd.label.toLowerCase().indexOf(query.toLowerCase());
              let labelContent: React.ReactNode = cmd.label;
              if (query && matchStart >= 0) {
                const before = cmd.label.slice(0, matchStart);
                const match = cmd.label.slice(matchStart, matchStart + query.length);
                const after = cmd.label.slice(matchStart + query.length);
                labelContent = (
                  <>
                    {before}
                    <span style={{ color: 'var(--accent)' }}>{match}</span>
                    {after}
                  </>
                );
              }

              return (
                <div
                  key={cmd.href}
                  role="button"
                  tabIndex={-1}
                  onClick={() => navigate(cmd.href)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--accent-muted)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 14,
                    transition: 'background 100ms',
                  }}
                >
                  <span>{labelContent}</span>
                  {cmd.shortcut && (
                    <kbd
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 12,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            <kbd style={{ fontFamily: 'var(--font-mono)' }}>↑↓</kbd> navigate
          </span>
          <span>
            <kbd style={{ fontFamily: 'var(--font-mono)' }}>Enter</kbd> select
          </span>
          <span>
            <kbd style={{ fontFamily: 'var(--font-mono)' }}>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
