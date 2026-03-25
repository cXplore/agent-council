'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProjectInfo {
  name: string;
  path: string;
}

interface ProjectsResponse {
  projects: ProjectInfo[];
  activeProject: string;
}

interface MeetingListItem {
  filename: string;
  title: string;
  type: string;
  status: string;
  modifiedAt: string;
  participants: string[];
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatType(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Home() {
  const [projects, setProjects] = useState<ProjectsResponse | null>(null);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.ok ? r.json() : null),
      fetch('/api/meetings').then(r => r.ok ? r.json() : []),
    ]).then(([p, m]) => {
      setProjects(p);
      setMeetings(Array.isArray(m) ? m.slice(0, 5) : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const hasProject = projects && projects.projects.length > 0;
  const activeName = projects?.activeProject === 'workspace' ? null : projects?.activeProject;
  const liveMeetings = meetings.filter(m => m.status === 'in-progress');
  const recentMeetings = meetings.filter(m => m.status !== 'in-progress').slice(0, 3);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="loading-shimmer h-8 w-48 rounded mb-4" />
          <div className="loading-shimmer h-4 w-72 rounded" />
        </div>
      </div>
    );
  }

  // No project connected — onboarding
  if (!hasProject) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-xl mx-auto px-6 py-20 text-center">
          <h1 className="text-3xl font-semibold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            Agent Council
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
            Connect a project to start watching agent meetings live.
          </p>

          <Link
            href="/setup"
            className="px-6 py-3 rounded-lg text-sm font-medium inline-block"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Connect your first project
          </Link>

          <div className="mt-12 text-left">
            <div className="grid gap-3">
              {[
                { icon: '1', title: 'Connect a project', desc: 'Point us at your codebase. We detect your agents or help you create them.' },
                { icon: '2', title: 'Ask for a meeting', desc: 'In Claude Code, just say what you want to discuss. The facilitator handles the rest.' },
                { icon: '3', title: 'Watch it here', desc: 'Agent responses appear live. Add your own voice to the conversation.' },
              ].map(step => (
                <div
                  key={step.icon}
                  className="rounded-lg p-4 flex gap-4 items-start"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    {step.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{step.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Project connected — dashboard
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {activeName || 'Agent Council'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {liveMeetings.length > 0
              ? `${liveMeetings.length} meeting${liveMeetings.length > 1 ? 's' : ''} in progress`
              : 'No active meetings'}
          </p>
        </div>

        {/* Live meetings — prominent */}
        {liveMeetings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--live-green)' }}>
              Live now
            </h2>
            <div className="space-y-2">
              {liveMeetings.map(m => (
                <Link
                  key={m.filename}
                  href={`/meetings`}
                  className="block rounded-lg p-4 transition-colors hover:brightness-110"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: 'var(--live-green)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {m.title || formatType(m.type)}
                    </span>
                  </div>
                  {m.participants.length > 0 && (
                    <div className="text-xs mt-1.5 ml-5" style={{ color: 'var(--text-muted)' }}>
                      {m.participants.join(', ')}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <Link
            href="/meetings"
            className="rounded-lg p-4 transition-colors hover:brightness-110"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Meetings</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {meetings.length > 0 ? `${meetings.length} total` : 'None yet'}
            </div>
          </Link>
          <Link
            href="/agents"
            className="rounded-lg p-4 transition-colors hover:brightness-110"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Agents</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>View your team</div>
          </Link>
          <Link
            href="/setup"
            className="rounded-lg p-4 transition-colors hover:brightness-110"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Setup</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Connect or configure</div>
          </Link>
        </div>

        {/* Recent meetings */}
        {recentMeetings.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Recent
              </h2>
              <Link href="/meetings" className="text-xs" style={{ color: 'var(--accent)' }}>
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {recentMeetings.map(m => (
                <Link
                  key={m.filename}
                  href="/meetings"
                  className="block rounded-lg p-4 transition-colors hover:brightness-110"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--text-muted)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {m.title || formatType(m.type)}
                    </span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                      {formatTimeAgo(m.modifiedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty state — no meetings yet */}
        {meetings.length === 0 && (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Ready for your first meeting
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Open your project in Claude Code and ask for a meeting. It will appear here live.
            </p>
            <Link
              href="/guide"
              className="text-xs"
              style={{ color: 'var(--accent)' }}
            >
              See how it works
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
