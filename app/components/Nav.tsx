'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

const NAV_ITEMS = [
  { href: '/meetings', label: 'Meetings' },
  { href: '/agents', label: 'Agents' },
];

interface ProjectInfo {
  name: string;
  path: string;
}

interface ProjectsResponse {
  projects: ProjectInfo[];
  activeProject: string;
  hasWorkspace: boolean;
}

function ProjectSwitcher({ inline }: { inline?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSwitch = useCallback(async (name: string) => {
    if (!data || name === data.activeProject) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch', name }),
      });
      setOpen(false);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }, [data]);

  const handleRemove = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Remove "${name}" from Agent Council? You'll need to reconnect it from Setup.`)) return;
    setSwitching(true);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name }),
      });
      setOpen(false);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }, [router]);

  if (!data) {
    return (
      <div className={inline ? 'w-full' : ''}>
        <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
          <span>&nbsp;</span>
        </span>
      </div>
    );
  }

  const hasProjects = data.projects.length > 0;
  const isOnWorkspace = data.activeProject === 'workspace';
  const activeProject = data.projects.find(p => p.name === data.activeProject);
  const activeLabel = isOnWorkspace
    ? (hasProjects ? 'Workspace' : null)
    : activeProject?.name ?? data.activeProject;

  // No project connected and on workspace — show link to setup
  if (!hasProjects && isOnWorkspace) {
    return (
      <div className={inline ? 'w-full' : ''}>
        <a
          href="/setup"
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{
            color: 'var(--text-muted)',
            width: inline ? '100%' : undefined,
            padding: inline ? '8px 12px' : undefined,
            borderRadius: inline ? '8px' : undefined,
            background: inline ? 'var(--bg-elevated)' : undefined,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              border: '1.5px solid var(--text-muted)',
              flexShrink: 0,
            }}
          />
          <span>Connect a project</span>
        </a>
      </div>
    );
  }

  return (
    <div ref={ref} className={inline ? 'w-full' : 'relative'}>
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="flex items-center gap-1.5 text-sm transition-colors"
        style={{
          color: 'var(--text-secondary)',
          opacity: switching ? 0.5 : 1,
          width: inline ? '100%' : undefined,
          padding: inline ? '8px 12px' : undefined,
          borderRadius: inline ? '8px' : undefined,
          background: inline ? 'var(--bg-elevated)' : undefined,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeLabel}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: inline ? 'relative' : 'absolute',
            top: inline ? 4 : '100%',
            left: 0,
            marginTop: inline ? 0 : 8,
            width: inline ? '100%' : 280,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 4,
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* Connected projects */}
          {data.projects.map(project => (
            <div
              key={project.name}
              role="button"
              tabIndex={0}
              onClick={() => handleSwitch(project.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSwitch(project.name); } }}
              className="w-full text-left transition-colors group cursor-pointer"
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: data.activeProject === project.name ? 'var(--accent-muted)' : 'transparent',
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 28,
                  borderRadius: 2,
                  background: data.activeProject === project.name ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  className="text-sm"
                  style={{
                    color: data.activeProject === project.name ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: data.activeProject === project.name ? 600 : 400,
                  }}
                >
                  {project.name}
                </div>
                <div
                  className="text-xs"
                  style={{
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.path}
                </div>
              </div>
              <button
                onClick={(e) => handleRemove(project.name, e)}
                className="text-xs rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
                style={{ color: 'var(--text-muted)', flexShrink: 0, padding: '2px 6px' }}
                title="Remove project"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Deselect + actions */}
          <div
            style={{
              height: 1,
              background: 'var(--border)',
              margin: '4px 10px',
            }}
          />
          {!isOnWorkspace && (
            <button
              onClick={() => handleSwitch('workspace')}
              className="w-full text-left transition-colors"
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              Deselect project
            </button>
          )}
          <a
            href="/setup"
            onClick={() => setOpen(false)}
            className="text-left transition-colors block"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            Connect project
          </a>
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50 px-4 sm:px-6 py-3"
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-4 sm:gap-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Agent Council
        </Link>

        {/* Desktop project switcher */}
        <div className="hidden sm:block">
          <ProjectSwitcher />
        </div>

        <div className="flex-1" />

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/guide"
            className="text-xs transition-colors"
            style={{ color: pathname === '/guide' ? 'var(--accent)' : 'var(--text-muted)', opacity: 0.7 }}
            title="How it works"
          >
            ?
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="sm:hidden text-sm px-2 py-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4L14 14M14 4L4 14" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 5H15M3 9H15M3 13H15" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div id="mobile-nav" className="sm:hidden mt-3 pb-1 space-y-1">
          {/* Mobile project switcher — above nav items */}
          <div style={{ marginBottom: 8 }}>
            <ProjectSwitcher inline />
          </div>

          {NAV_ITEMS.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
