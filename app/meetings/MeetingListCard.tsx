import type { MeetingListItem } from '@/lib/types';

export function formatType(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Get a subtle type indicator character for meeting types */
export function getTypeIndicator(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('standup')) return '\u25B3'; // triangle
  if (t.includes('design')) return '\u25CB'; // circle
  if (t.includes('strategy')) return '\u25C7'; // diamond
  if (t.includes('architecture')) return '\u25A1'; // square
  if (t.includes('retrospective')) return '\u25C1'; // left-pointing triangle
  if (t.includes('sprint')) return '\u25B7'; // right-pointing triangle
  if (t.includes('incident')) return '\u25CF'; // filled circle
  return '\u25CB'; // default: circle
}

export function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format duration between two ISO timestamps into a human-readable string */
export function formatDuration(started: string, ended: string): string {
  const ms = new Date(ended).getTime() - new Date(started).getTime();
  if (ms < 0) return '';
  const totalMins = Math.round(ms / 60000);
  if (totalMins < 1) return '<1 min';
  if (totalMins < 60) return `~${totalMins} min`;
  const hours = totalMins / 60;
  if (hours < 10) {
    const rounded = Math.round(hours * 10) / 10;
    return rounded === Math.floor(rounded)
      ? `~${Math.floor(rounded)} hr${Math.floor(rounded) !== 1 ? 's' : ''}`
      : `~${rounded} hrs`;
  }
  return `~${Math.round(hours)} hrs`;
}

/** Small muted badge for project names */
export function ProjectBadge({ project }: { project: string }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{
        color: 'var(--text-muted)',
        background: 'var(--border)',
        whiteSpace: 'nowrap',
      }}
    >
      {project}
    </span>
  );
}

interface MeetingListCardProps {
  meeting: MeetingListItem;
  onSelect: (filename: string) => void;
  onDelete: (filename: string) => void;
  taggedMeetings: Set<string>;
  hasMultipleProjects: boolean;
  focused?: boolean;
  tagCounts?: { decisions: number; open: number; actions: number };
}

export default function MeetingListCard({
  meeting: m,
  onSelect,
  onDelete,
  taggedMeetings,
  hasMultipleProjects,
  focused,
  tagCounts,
}: MeetingListCardProps) {
  return (
    <div
      key={m.filename}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(m.filename)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m.filename); } }}
      className="w-full text-left rounded-lg p-4 transition-colors hover:brightness-110 group cursor-pointer"
      style={{
        background: 'var(--bg-card)',
        border: focused
          ? '1px solid var(--accent)'
          : m.status === 'in-progress'
            ? '1px solid var(--live-green)'
            : '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-3 mb-1">
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${m.status === 'in-progress' ? 'animate-pulse' : ''}`}
          style={{
            background: m.status === 'in-progress' ? 'var(--live-green)' : 'var(--text-muted)',
          }}
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {m.title || formatType(m.type)}
        </span>
        {m.status === 'in-progress' && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)' }}
          >
            LIVE
          </span>
        )}
        {taggedMeetings.size > 0 && m.status === 'complete' && !taggedMeetings.has(m.filename) && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="This meeting predates the tagging system — outcomes not indexed"
          >
            untagged
          </span>
        )}
        {m.filename.startsWith('example-') && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
          >
            SAMPLE
          </span>
        )}
        {hasMultipleProjects && m.project && (
          <ProjectBadge project={m.project} />
        )}
      </div>
      <div className="flex items-center gap-2 ml-5 mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span style={{ marginRight: 4, opacity: 0.6 }}>{getTypeIndicator(m.type)}</span>
          {formatType(m.type)}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {m.date}
        </span>
        {m.participants.length > 0 && (
          <>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {m.participants.length} agent{m.participants.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {m.status === 'complete' && m.started && (() => {
          const dur = formatDuration(m.started, m.modifiedAt);
          return dur ? (
            <>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dur}</span>
            </>
          ) : null;
        })()}
      </div>

      {m.participants.length > 0 && (
        <div className="text-xs mt-1 ml-5" style={{ color: 'var(--text-muted)' }}>
          {m.participants.join(', ')}
        </div>
      )}

      {m.preview && (
        <div className="text-xs mt-2 ml-5 line-clamp-2" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
          {m.preview}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 ml-5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {formatTimeAgo(m.modifiedAt)}
        </span>
        {m.status !== 'in-progress' && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(m.filename); }}
            className="text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
