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
          <div key={agent.name} className="flex items-center gap-2.5">
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
          </div>
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

  return (
    <div className="rounded-lg px-5 py-4" style={cardStyle}>
      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Recent activity
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

function DashboardInner() {
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null);
  const [tags, setTags] = useState<TagSummary | null>(null);
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
