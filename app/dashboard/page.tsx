'use client';

import { useState, useEffect, Suspense } from 'react';
import { getAgentColor } from '@/lib/utils';

interface MeetingAnalytics {
  totalMeetings: number;
  completedMeetings: number;
  liveMeetings: number;
  meetingsByType: Record<string, number>;
  totalParticipants: string[];
  mostActiveAgents: { name: string; meetingCount: number }[];
  recentActivity: { last7Days: number; last30Days: number };
  averageParticipants: number;
}

interface TagSummary {
  decisions: number;
  open: number;
  actions: number;
  meetingCount: number;
}

interface TermEntry {
  word: string;
  count: number;
}

interface KeyTermsData {
  terms: TermEntry[];
  meetingTitle: string;
}

function CountCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  return (
    <div className="rounded-lg px-4 py-3 flex-1 min-w-[120px]" style={cardStyle}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div
        className="text-2xl font-semibold"
        style={{ color: accent ?? 'var(--text-primary)' }}
      >
        {value}
      </div>
    </div>
  );
}

function TypeDistribution({ meetingsByType }: { meetingsByType: Record<string, number> }) {
  const entries = Object.entries(meetingsByType).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  const max = entries[0][1];

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Meeting types
      </div>
      <div className="space-y-2">
        {entries.map(([type, count]) => (
          <div key={type} className="flex items-center gap-3">
            <span
              className="text-xs w-[120px] flex-shrink-0 text-right truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              {type}
            </span>
            <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg)' }}>
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${(count / max) * 100}%`,
                  background: 'var(--accent)',
                  minWidth: 4,
                }}
              />
            </div>
            <span
              className="text-xs w-[28px] flex-shrink-0 text-right tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveAgents({ agents }: { agents: { name: string; meetingCount: number }[] }) {
  const display = agents.slice(0, 10);
  if (display.length === 0) return null;

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Most active agents
      </div>
      <div className="space-y-1.5">
        {display.map((agent) => (
          <a key={agent.name} href={`/agents?agent=${encodeURIComponent(agent.name)}`} className="flex items-center gap-2.5 hover:brightness-125 transition-colors rounded px-1 -mx-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: getAgentColor(agent.name) }}
            />
            <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {agent.name}
            </span>
            <span
              className="text-xs tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {agent.meetingCount} meeting{agent.meetingCount !== 1 ? 's' : ''}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function RecentActivity({ recentActivity }: { recentActivity: { last7Days: number; last30Days: number } }) {
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  // Calculate trend: compare 7-day rate vs 30-day average weekly rate
  const weeklyAvg30d = recentActivity.last30Days / 4.3; // ~4.3 weeks in 30 days
  const trend = recentActivity.last7Days > 0 && weeklyAvg30d > 0
    ? ((recentActivity.last7Days - weeklyAvg30d) / weeklyAvg30d) * 100
    : 0;
  const trendLabel = Math.abs(trend) < 5 ? 'steady' : trend > 0 ? 'trending up' : 'trending down';
  const trendColor = Math.abs(trend) < 5 ? 'var(--text-muted)' : trend > 0 ? 'var(--live-green)' : 'var(--warning)';
  const trendArrow = Math.abs(trend) < 5 ? '→' : trend > 0 ? '↑' : '↓';

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        <span>Recent activity</span>
        {recentActivity.last30Days > 0 && (
          <span className="text-xs" style={{ color: trendColor }} title={`${Math.round(Math.abs(trend))}% vs monthly average`}>
            {trendArrow} {trendLabel}
          </span>
        )}
      </div>
      <div className="flex gap-6">
        <div>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {recentActivity.last7Days}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>last 7 days</div>
        </div>
        <div>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {recentActivity.last30Days}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>last 30 days</div>
        </div>
      </div>
    </div>
  );
}

function TagsSummary({ tags }: { tags: TagSummary }) {
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  const items = [
    { label: 'Decisions', count: tags.decisions, color: 'var(--accent)' },
    { label: 'Open questions', count: tags.open, color: 'var(--warning)' },
    { label: 'Action items', count: tags.actions, color: 'var(--live-green)' },
  ];

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Outcomes tracked
      </div>
      <div className="flex gap-6 flex-wrap">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-lg font-semibold" style={{ color: item.color }}>
              {item.count}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingTimeline({ meetings }: { meetings: { filename: string; title: string; date: string | null; status: string }[] }) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const mapped = meetings
    .filter(m => m.date)
    .map(m => {
      const d = new Date(m.date!);
      const offset = (d.getTime() - thirtyDaysAgo.getTime()) / (now.getTime() - thirtyDaysAgo.getTime());
      return { ...m, offset: Math.max(0, Math.min(1, offset)) };
    })
    .filter(m => m.offset >= 0);

  if (mapped.length === 0) return null;

  const midDate = new Date(thirtyDaysAgo.getTime() + (now.getTime() - thirtyDaysAgo.getTime()) / 2);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Meeting timeline (30 days)
      </div>
      <div className="relative h-6 rounded" style={{ background: 'var(--bg)' }}>
        {mapped.map((m) => (
          <a
            key={m.filename}
            href={`/meetings?file=${encodeURIComponent(m.filename)}`}
            title={m.title || m.filename}
            className="absolute top-1 rounded-sm transition-opacity hover:opacity-80"
            style={{
              left: `${m.offset * 100}%`,
              width: 6,
              height: 16,
              marginLeft: -3,
              background: m.status === 'in-progress' ? 'var(--live-green)' : 'var(--accent)',
              animation: m.status === 'in-progress' ? 'pulse 2s ease-in-out infinite' : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmt(thirtyDaysAgo)}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmt(midDate)}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmt(now)}</span>
      </div>
    </div>
  );
}

function KeyTermsBar({ data }: { data: KeyTermsData }) {
  const display = data.terms.slice(0, 10);
  if (display.length === 0) return null;

  const max = display[0].count;

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
  };

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
        Key terms (latest meeting)
      </div>
      <div className="text-xs mb-3 truncate" style={{ color: 'var(--text-secondary)' }}>
        {data.meetingTitle}
      </div>
      <div className="space-y-2">
        {display.map((term) => (
          <div key={term.word} className="flex items-center gap-3">
            <a
              href={`/meetings?search=${encodeURIComponent(term.word)}`}
              className="text-xs w-[120px] flex-shrink-0 text-right truncate hover:underline"
              style={{ color: 'var(--text-secondary)' }}
              title={`Search meetings for "${term.word}"`}
            >
              {term.word}
            </a>
            <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg)' }}>
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${(term.count / max) * 100}%`,
                  background: 'var(--accent)',
                  minWidth: 4,
                }}
              />
            </div>
            <span
              className="text-xs w-[28px] flex-shrink-0 text-right tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {term.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardInner() {
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null);
  const [tags, setTags] = useState<TagSummary | null>(null);
  const [keyTerms, setKeyTerms] = useState<KeyTermsData | null>(null);
  const [recentMeetings, setRecentMeetings] = useState<{ filename: string; title: string; date: string | null; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [analyticsRes, tagsRes] = await Promise.all([
          fetch('/api/meetings/analytics'),
          fetch('/api/meetings/tags?mode=summary'),
        ]);

        if (!analyticsRes.ok) throw new Error('Analytics fetch failed');
        const analyticsData: MeetingAnalytics = await analyticsRes.json();
        setAnalytics(analyticsData);

        if (tagsRes.ok) {
          const tagsData: TagSummary = await tagsRes.json();
          setTags(tagsData);
        }

        // Fetch meetings list for key terms and recent meetings
        try {
          const meetingsRes = await fetch('/api/meetings');
          if (meetingsRes.ok) {
            const meetings: { filename: string; status: string; title: string; date: string | null }[] = await meetingsRes.json();
            // Store recent meetings for quick-access
            setRecentMeetings(meetings.slice(0, 5).map(m => ({ filename: m.filename, title: m.title, date: m.date, status: m.status })));
            const completed = meetings.find(m => m.status === 'complete');
            if (completed) {
              const termsRes = await fetch(`/api/meetings/terms?file=${encodeURIComponent(completed.filename)}`);
              if (termsRes.ok) {
                const termsData: { terms: TermEntry[] } = await termsRes.json();
                setKeyTerms({ terms: termsData.terms, meetingTitle: completed.title });
              }
            }
          }
        } catch {
          // Key terms are non-critical; silently skip on failure
        }
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
            Dashboard
          </h1>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="loading-shimmer h-3 w-12 rounded mb-2" />
                <div className="loading-shimmer h-6 w-8 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="loading-shimmer h-3 w-24 rounded mb-3" />
                <div className="space-y-2">
                  <div className="loading-shimmer h-3 w-full rounded" />
                  <div className="loading-shimmer h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (fetchError || !analytics) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
            Dashboard
          </h1>
          <div
            className="rounded-lg px-5 py-4 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--error)', color: 'var(--text-secondary)' }}
          >
            Could not load dashboard data. Check that the project directory exists and try refreshing.
          </div>
        </div>
      </div>
    );
  }

  const hasData = analytics.totalMeetings > 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Dashboard
          </h1>
          {hasData && (
            <a
              href="/api/meetings/export"
              className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:brightness-125"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              download
            >
              Export meetings (JSON)
            </a>
          )}
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {analytics.totalMeetings} meeting{analytics.totalMeetings !== 1 ? 's' : ''} &middot;{' '}
          {analytics.totalParticipants.length} agent{analytics.totalParticipants.length !== 1 ? 's' : ''} &middot;{' '}
          {analytics.averageParticipants} avg participants
        </p>

        {!hasData ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              No meetings yet. Run your first meeting to see analytics here.
            </p>
            <a
              href="/meetings"
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              View meetings
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Count cards */}
            <div className="flex gap-3 flex-wrap">
              <CountCard label="Total" value={analytics.totalMeetings} />
              <CountCard label="Completed" value={analytics.completedMeetings} />
              <CountCard
                label="Live"
                value={analytics.liveMeetings}
                accent={analytics.liveMeetings > 0 ? 'var(--live-green)' : undefined}
              />
            </div>

            {/* Two-column layout for type distribution and active agents */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TypeDistribution meetingsByType={analytics.meetingsByType} />
              <ActiveAgents agents={analytics.mostActiveAgents} />
            </div>

            {/* Bottom row: recent activity and tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RecentActivity recentActivity={analytics.recentActivity} />
              {tags && <TagsSummary tags={tags} />}
            </div>

            {/* Meeting timeline */}
            {recentMeetings.length > 0 && (
              <MeetingTimeline meetings={recentMeetings} />
            )}

            {/* Key terms from latest completed meeting */}
            {keyTerms && keyTerms.terms.length > 0 && (
              <KeyTermsBar data={keyTerms} />
            )}

            {/* Recent meetings quick-access */}
            {recentMeetings.length > 0 && (
              <div className="rounded-lg px-5 py-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Recent meetings</div>
                <div className="space-y-1.5">
                  {recentMeetings.slice(0, 5).map(m => (
                    <a
                      key={m.filename}
                      href={`/meetings?file=${encodeURIComponent(m.filename)}`}
                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:brightness-110 transition-colors"
                      style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.status === 'in-progress' ? 'animate-pulse' : ''}`}
                        style={{ background: m.status === 'in-progress' ? 'var(--live-green)' : 'var(--text-muted)' }}
                      />
                      <span className="truncate flex-1">{m.title || m.filename}</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{m.date}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <a href="/meetings" className="hover:underline" style={{ color: 'var(--accent)' }}>View all meetings</a>
              <span>&middot;</span>
              <a href="/agents" className="hover:underline" style={{ color: 'var(--accent)' }}>Browse agents</a>
              <span>&middot;</span>
              <a href="/settings" className="hover:underline" style={{ color: 'var(--accent)' }}>Settings</a>
              <span>&middot;</span>
              <a href="/api/meetings/feed" className="hover:underline" style={{ color: 'var(--text-muted)' }}>RSS</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}
