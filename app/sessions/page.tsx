'use client';

import { useState, useEffect } from 'react';

interface SessionInfo {
  id: string;
  title: string;
  firstMessage: string;
  lastActivity: string;
  messageCount: number;
  isActive: boolean;
  project: string;
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

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState('');

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => {
        setSessions(data.sessions || []);
        setProject(data.project || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Poll for active session changes
    const interval = setInterval(() => {
      fetch('/api/sessions')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) setSessions(data.sessions || []);
        })
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const activeSessions = sessions.filter(s => s.isActive);
  const recentSessions = sessions.filter(s => !s.isActive);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Sessions
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Claude Code sessions for {project || 'your project'}. Reads from local session data.
        </p>

        {loading ? (
          <div className="space-y-3">
            <div className="loading-shimmer h-16 rounded-lg" />
            <div className="loading-shimmer h-16 rounded-lg" />
            <div className="loading-shimmer h-16 rounded-lg" />
          </div>
        ) : sessions.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              No sessions found
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Connect a project that has been used with Claude Code to see its sessions here.
            </p>
          </div>
        ) : (
          <>
            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--live-green)' }}>
                  Active now
                </h2>
                <div className="space-y-2">
                  {activeSessions.map(session => (
                    <div
                      key={session.id}
                      className="rounded-lg p-4"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)' }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0 mt-1.5" style={{ background: 'var(--live-green)' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                            {session.title}
                          </div>
                          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>{session.messageCount} messages</span>
                            <span>&middot;</span>
                            <span>{formatTimeAgo(session.lastActivity)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent sessions */}
            {recentSessions.length > 0 && (
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                  Recent sessions
                </h2>
                <div className="space-y-2">
                  {recentSessions.map(session => (
                    <div
                      key={session.id}
                      className="rounded-lg p-4"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--text-muted)' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                            {session.title}
                          </div>
                          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>{session.messageCount} messages</span>
                            <span>&middot;</span>
                            <span>{formatTimeAgo(session.lastActivity)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
