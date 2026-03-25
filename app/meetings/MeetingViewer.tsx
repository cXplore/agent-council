'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MeetingListItem, MeetingDetail } from '@/lib/types';
import { getAgentColor } from '@/lib/utils';
import { createMeetingComponents } from '@/lib/md-components';

const POLL_INTERVAL = 2000;

function formatType(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Small muted badge for project names */
function ProjectBadge({ project }: { project: string }) {
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

const mdComponents = createMeetingComponents(getAgentColor);

export default function MeetingViewer() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [userExplicitlyBack, setUserExplicitlyBack] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active project from the API
  const [activeProject, setActiveProject] = useState<string | null>(null);

  // Track seen content for fade-in splitting
  const [seenContent, setSeenContent] = useState<string>('');

  const contentRef = useRef<HTMLDivElement>(null);
  const lastModifiedRef = useRef<string>('');
  const lastContentLengthRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const recentlyUpdatedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedRef = useRef<string | null>(null);
  const userExplicitlyBackRef = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { userExplicitlyBackRef.current = userExplicitlyBack; }, [userExplicitlyBack]);
  useEffect(() => { userScrolledUpRef.current = userScrolledUp; }, [userScrolledUp]);

  // Fetch the active project on mount
  useEffect(() => {
    async function fetchActiveProject() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setActiveProject(data.activeProject ?? null);
        }
      } catch {
        // silent — will work without project context
      }
    }
    fetchActiveProject();
  }, []);

  // Build query string with optional project param
  const projectParam = useCallback((extra?: string) => {
    const params = new URLSearchParams();
    if (activeProject) params.set('project', activeProject);
    if (extra) {
      const extraParams = new URLSearchParams(extra);
      extraParams.forEach((v, k) => params.set(k, v));
    }
    const str = params.toString();
    return str ? `?${str}` : '';
  }, [activeProject]);

  // Fetch meeting list — stable callback using refs for auto-select logic
  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings${projectParam()}`);
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);

      // Auto-select if exactly one is in-progress (but not if user explicitly went back)
      if (!selectedRef.current && !userExplicitlyBackRef.current) {
        const inProgress = data.filter((m: MeetingListItem) => m.status === 'in-progress');
        if (inProgress.length === 1) {
          setSelected(inProgress[0].filename);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectParam]);

  // Fetch single meeting content
  const fetchDetail = useCallback(async (filename: string) => {
    try {
      const res = await fetch(`/api/meetings${projectParam(`file=${encodeURIComponent(filename)}`)}`);
      if (!res.ok) return;
      const data: MeetingDetail = await res.json();

      // Only update if content changed
      if (data.modifiedAt !== lastModifiedRef.current) {
        lastModifiedRef.current = data.modifiedAt;

        // Track if content grew (new agent response)
        const newLength = data.content?.length ?? 0;
        if (newLength > lastContentLengthRef.current) {
          setRecentlyUpdated(true);
          // Clear any existing timer to prevent leaks
          if (recentlyUpdatedTimerRef.current) {
            clearTimeout(recentlyUpdatedTimerRef.current);
          }
          recentlyUpdatedTimerRef.current = setTimeout(() => setRecentlyUpdated(false), 3000);
        }
        lastContentLengthRef.current = newLength;

        setDetail(data);

        // After animation plays, mark all content as seen
        setTimeout(() => {
          setSeenContent(data.content ?? '');
        }, 600);

        // Auto-scroll if user hasn't scrolled up
        if (!userScrolledUpRef.current && contentRef.current) {
          requestAnimationFrame(() => {
            contentRef.current?.scrollTo({
              top: contentRef.current.scrollHeight,
              behavior: 'smooth',
            });
          });
        }
      }

      // Stop polling if complete
      if (data.status === 'complete' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = undefined;
      }
    } catch {
      // silent
    }
  }, [projectParam]);

  // Initial list load + periodic refresh
  useEffect(() => {
    fetchList();
    const interval = setInterval(fetchList, 5000);
    return () => clearInterval(interval);
  }, [fetchList]);

  // Poll selected meeting
  useEffect(() => {
    if (!selected) return;

    lastModifiedRef.current = '';
    lastContentLengthRef.current = 0;
    setDetail(null);
    setSeenContent('');
    setUserScrolledUp(false);
    fetchDetail(selected);

    pollRef.current = setInterval(() => fetchDetail(selected), POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (recentlyUpdatedTimerRef.current) clearTimeout(recentlyUpdatedTimerRef.current);
    };
  }, [selected, fetchDetail]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setUserScrolledUp(!nearBottom);
  }, []);

  const scrollToBottom = () => {
    contentRef.current?.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
    setUserScrolledUp(false);
  };

  const deleteMeeting = async (filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/meetings${projectParam(`file=${encodeURIComponent(filename)}`)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete meeting');
        return;
      }
      setMeetings(prev => prev.filter(m => m.filename !== filename));
    } catch {
      setError('Failed to delete meeting');
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !selected || sending) return;
    setSending(true);
    setError(null);
    try {
      const body: Record<string, string> = { file: selected, message: chatInput.trim() };
      if (activeProject) body.project = activeProject;

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to send message');
        return;
      }
      setChatInput('');
      fetchDetail(selected);
    } catch {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Check if meetings span multiple projects
  const hasMultipleProjects = (() => {
    const projects = new Set(meetings.map(m => m.project).filter(Boolean));
    return projects.size > 1;
  })();

  // ─── List View ───
  if (!selected) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
            Meetings
          </h1>

          {/* How to start */}
          <div
            className="rounded-lg px-5 py-4 mb-6 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>New meeting:</span>{' '}
            in Claude Code, ask for one — <em>&quot;run a meeting about the API design&quot;</em> or <em>&quot;let&apos;s have a design review on the dashboard&quot;</em>. It shows up here live.
          </div>

          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</div>
          ) : meetings.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No meetings yet.
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <div
                  className="rounded-lg px-4 py-2 text-sm flex items-center justify-between"
                  style={{ background: 'var(--error)', color: 'white' }}
                >
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-2 text-white/80 hover:text-white">&#x2715;</button>
                </div>
              )}
              {meetings.map((m) => (
                <div
                  key={m.filename}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelected(m.filename); setUserExplicitlyBack(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(m.filename); setUserExplicitlyBack(false); } }}
                  className="w-full text-left rounded-lg p-4 transition-colors hover:brightness-110 group cursor-pointer"
                  style={{
                    background: 'var(--bg-card)',
                    border: m.status === 'in-progress'
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
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
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
                      {formatType(m.type)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {m.date}
                    </span>
                  </div>

                  {m.participants.length > 0 && (
                    <div className="text-xs mt-1 ml-5" style={{ color: 'var(--text-muted)' }}>
                      {m.participants.join(', ')}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2 ml-5">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatTimeAgo(m.modifiedAt)}
                      {m.participants.length > 0 && ` \u00b7 ${m.participants.length} agents`}
                    </span>
                    {m.status !== 'in-progress' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMeeting(m.filename); }}
                        className="text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Detail View ───
  const isLive = detail?.status === 'in-progress';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 px-6 py-3 flex items-center gap-4"
        style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => { setSelected(null); setUserExplicitlyBack(true); }}
          className="text-sm hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          &larr; All meetings
        </button>

        <div className="flex-1" />

        {detail && (
          <>
            {detail.project && (
              <ProjectBadge project={detail.project} />
            )}

            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {detail.title || formatType(detail.type)}
            </span>

            {isLive && (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ background: 'var(--live-green)' }}
                title="Meeting in progress"
              />
            )}
          </>
        )}
      </div>

      {/* Participants bar */}
      {detail && detail.participants.length > 0 && (
        <div
          className="px-6 py-2 text-xs flex items-center gap-3 flex-wrap"
          style={{
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Participants:</span>
          {detail.participants.map((p) => (
            <span
              key={p}
              className="px-2 py-0.5 rounded"
              style={{
                color: getAgentColor(p),
                background: `${getAgentColor(p).replace(')', ', 0.12)').replace('hsl(', 'hsla(')}`,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Content area */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-8"
      >
        <div className="max-w-3xl mx-auto">
          {!detail ? (
            <div className="space-y-4">
              <div className="loading-shimmer h-8 w-64 rounded" />
              <div className="loading-shimmer h-4 w-96 rounded" />
              <div className="loading-shimmer h-4 w-80 rounded" />
              <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Loading meeting...</p>
            </div>
          ) : isLive && !detail.content.match(/\*\*[\w-]+:\*\*/) ? (
            /* Meeting file exists but no agent has responded yet */
            <div className="space-y-6">
              <div className="prose prose-sm prose-invert max-w-none meeting-new-content">
                <ReactMarkdown components={mdComponents}>
                  {detail.content.replace(/<!--[\s\S]*?-->\n?/g, '')}
                </ReactMarkdown>
              </div>
              <div
                className="rounded-lg p-6 text-center"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)', borderStyle: 'dashed' }}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--live-green)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--live-green)' }}>Meeting starting...</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  The facilitator is assembling the team. Agent responses will appear here as they come in.
                </p>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              {(() => {
                const clean = detail.content.replace(/<!--[\s\S]*?-->\n?/g, '');
                const cleanSeen = seenContent.replace(/<!--[\s\S]*?-->\n?/g, '');
                const hasNew = clean.length > cleanSeen.length && cleanSeen.length > 0;
                // Split at newline boundary to avoid breaking markdown mid-block
                let splitIdx = cleanSeen.length;
                if (hasNew) {
                  const nlIdx = clean.lastIndexOf('\n', splitIdx);
                  if (nlIdx > 0) splitIdx = nlIdx + 1;
                }
                const seenPart = hasNew ? clean.slice(0, splitIdx) : clean;
                const newPart = hasNew ? clean.slice(splitIdx) : null;

                return (
                  <>
                    <div className="meeting-content">
                      <ReactMarkdown components={mdComponents}>{seenPart}</ReactMarkdown>
                    </div>
                    {newPart && (
                      <div className="meeting-new-content">
                        <ReactMarkdown components={mdComponents}>{newPart}</ReactMarkdown>
                      </div>
                    )}
                  </>
                );
              })()}

              {isLive && (
                <div className="mt-8 flex items-center gap-2">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${recentlyUpdated ? 'animate-ping' : 'animate-pulse'}`}
                    style={{ background: recentlyUpdated ? 'var(--live-green)' : 'var(--accent)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {recentlyUpdated ? 'New response received' : 'Agents deliberating...'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-6 py-2 text-sm flex items-center justify-between"
          style={{ background: 'var(--error)', color: 'white' }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-white/80 hover:text-white">&#x2715;</button>
        </div>
      )}

      {/* Chat input for live meetings */}
      {isLive && (
        <div
          className="sticky bottom-0 px-6 py-3"
          style={{
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div className="max-w-3xl mx-auto flex gap-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Add your thoughts (agents see this in the next round)..."
              disabled={sending}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!chatInput.trim() || sending}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
              style={{
                background: 'var(--accent)',
                color: 'var(--bg)',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Scroll to bottom button */}
      {userScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 sm:bottom-20 right-6 z-10 px-4 py-2 rounded-full text-sm shadow-lg transition-opacity"
          style={{
            background: 'var(--accent)',
            color: 'var(--bg)',
          }}
        >
          Scroll to latest &darr;
        </button>
      )}
    </div>
  );
}
