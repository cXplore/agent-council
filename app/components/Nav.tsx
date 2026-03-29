'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

const NAV_ITEMS = [
  { href: '/meetings', label: 'Meetings' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/agents', label: 'Agents' },
];

type ConnectionHealth = 'online' | 'slow' | 'offline';

function ConnectionDot({ health }: { health: ConnectionHealth }) {
  const color =
    health === 'online' ? 'var(--live-green, #22c55e)' :
    health === 'slow' ? '#eab308' :
    '#ef4444';

  return (
    <span
      title={health === 'offline' ? 'Server offline' : health === 'slow' ? 'Server slow' : 'Connected'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {health === 'offline' && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>offline</span>
      )}
    </span>
  );
}

interface ProjectStatusItem {
  name: string;
  path: string;
  active: boolean;
  liveMeetings: number;
  totalMeetings: number;
  status: 'meeting' | 'working' | 'idle';
  latestMeetingTitle?: string;
}

function StatusIndicator({ status }: { status: ProjectStatusItem['status'] }) {
  if (status === 'meeting') {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full animate-pulse flex-shrink-0"
        style={{ background: 'var(--live-green, #22c55e)' }}
        title="Live meeting"
      />
    );
  }
  if (status === 'working') {
    return (
      <span className="flex-shrink-0" style={{ color: 'var(--accent)', fontSize: 10, lineHeight: 1 }} title="Active work">
        ⚡
      </span>
    );
  }
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: 'var(--border)' }}
      title="Idle"
    />
  );
}

function ProjectTabs({ projects, onSwitch, onRemove }: { projects: ProjectStatusItem[]; onSwitch: (name: string) => void; onRemove: (name: string) => void }) {
  if (projects.length === 0) {
    return (
      <a
        href="/setup"
        className="flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', border: '1.5px solid var(--text-muted)', flexShrink: 0 }} />
        <span>Connect a project</span>
      </a>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {projects.map(project => (
        <div key={project.name} className="relative group flex items-center">
          <button
            onClick={() => onSwitch(project.name)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
            style={{
              background: project.active ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              color: project.active ? 'var(--accent)' : 'var(--text-muted)',
              border: project.active ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              fontWeight: project.active ? 600 : 400,
              paddingRight: 20,
            }}
            title={`${project.name} — ${project.totalMeetings} meetings${project.status === 'meeting' ? ' (live)' : ''}`}
          >
            <StatusIndicator status={project.status} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {project.name}
            </span>
          </button>
          {project.name !== 'workspace' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Disconnect "${project.name}" from Agent Council?`)) {
                  onRemove(project.name);
                }
              }}
              className="absolute right-1 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity rounded"
              style={{ color: 'var(--text-muted)', fontSize: 9, lineHeight: 1, padding: '2px 3px' }}
              title={`Disconnect ${project.name}`}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <a
        href="/setup"
        className="flex items-center justify-center text-xs rounded-md transition-colors"
        style={{
          color: 'var(--text-muted)',
          width: 24,
          height: 24,
          fontSize: 14,
        }}
        title="Connect project"
      >
        +
      </a>
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectStatusItem[]>([]);
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>('online');
  const consecutiveFailures = useRef(0);

  // Close mobile menu on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Derive meeting info from active project status
  const activeProject = projects.find(p => p.active);
  const hasLiveMeeting = activeProject?.liveMeetings ? activeProject.liveMeetings > 0 : false;
  const meetingCount = activeProject?.totalMeetings ?? 0;

  const handleRemove = useCallback(async (name: string) => {
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name }),
      });
      window.location.reload();
    } catch {
      // silent
    }
  }, []);

  const handleSwitch = useCallback(async (name: string) => {
    const current = projects.find(p => p.active);
    if (current?.name === name) return;
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch', name }),
      });
      window.location.reload();
    } catch {
      // silent
    }
  }, [projects]);

  // Poll project status every 10s — replaces the old /api/meetings poll
  useEffect(() => {
    const check = async () => {
      const start = Date.now();
      try {
        const res = await fetch('/api/projects/status');
        const elapsed = Date.now() - start;
        if (!res.ok) {
          consecutiveFailures.current++;
        } else {
          consecutiveFailures.current = 0;
          const data = await res.json();
          if (data.projects) {
            setProjects(data.projects);
          }
        }

        if (consecutiveFailures.current >= 3) {
          setConnectionHealth('offline');
        } else if (elapsed > 2000) {
          setConnectionHealth('slow');
        } else {
          setConnectionHealth('online');
        }
      } catch {
        consecutiveFailures.current++;
        if (consecutiveFailures.current >= 3) {
          setConnectionHealth('offline');
        }
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

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

        {/* Desktop project tabs */}
        <div className="hidden sm:flex items-center gap-1">
          <ConnectionDot health={connectionHealth} />
          <ProjectTabs projects={projects} onSwitch={handleSwitch} onRemove={handleRemove} />
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
                className="text-sm transition-colors flex items-center gap-1.5"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  paddingBottom: 2,
                }}
              >
                {item.label}
                {item.href === '/meetings' && hasLiveMeeting && !isActive && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: 'var(--live-green)' }}
                    title="Live meeting in progress"
                  />
                )}
                {item.href === '/meetings' && meetingCount > 0 && (
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 400,
                      lineHeight: 1,
                    }}
                  >
                    ({meetingCount})
                  </span>
                )}
              </Link>
            );
          })}
          <div className="flex items-center gap-3" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12, marginLeft: 2 }}>
            <Link
              href="/guide"
              className="text-xs transition-colors"
              style={{ color: pathname === '/guide' ? 'var(--accent)' : 'var(--text-muted)' }}
              title="Guide"
              aria-label="Guide"
            >
              ?
            </Link>
            <Link
              href="/settings"
              className="text-xs transition-colors"
              style={{ color: pathname === '/settings' ? 'var(--accent)' : 'var(--text-muted)' }}
              title="Settings"
              aria-label="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M13.5 8a5.5 5.5 0 0 0-.08-.88l1.44-1.13a.35.35 0 0 0 .08-.44l-1.37-2.36a.35.35 0 0 0-.42-.15l-1.7.68a5.2 5.2 0 0 0-1.52-.88L9.6 1.1a.35.35 0 0 0-.34-.28H6.74a.35.35 0 0 0-.34.28l-.25 1.74a5.2 5.2 0 0 0-1.52.88l-1.7-.68a.35.35 0 0 0-.42.15L1.14 5.55a.35.35 0 0 0 .08.44l1.44 1.13A5.5 5.5 0 0 0 2.5 8c0 .3.03.59.08.88l-1.44 1.13a.35.35 0 0 0-.08.44l1.37 2.36c.08.15.27.21.42.15l1.7-.68c.47.35.97.65 1.52.88l.25 1.74c.03.16.18.28.34.28h2.52c.16 0 .31-.12.34-.28l.25-1.74a5.2 5.2 0 0 0 1.52-.88l1.7.68c.15.06.34 0 .42-.15l1.37-2.36a.35.35 0 0 0-.08-.44l-1.44-1.13c.05-.29.08-.58.08-.88z" />
              </svg>
            </Link>
          </div>
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
          {/* Mobile project tabs — above nav items */}
          <div style={{ marginBottom: 8, padding: '4px 8px' }}>
            <ProjectTabs projects={projects} onSwitch={handleSwitch} onRemove={handleRemove} />
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
                {item.href === '/meetings' && meetingCount > 0 && (
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 400,
                      marginLeft: 4,
                    }}
                  >
                    ({meetingCount})
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href="/guide"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              color: pathname === '/guide' ? 'var(--accent)' : 'var(--text-muted)',
              background: pathname === '/guide' ? 'var(--accent-muted)' : 'transparent',
            }}
          >
            Guide
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              color: pathname === '/settings' ? 'var(--accent)' : 'var(--text-muted)',
              background: pathname === '/settings' ? 'var(--accent-muted)' : 'transparent',
            }}
          >
            Settings
          </Link>
        </div>
      )}
    </nav>
  );
}
