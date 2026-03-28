'use client';

import type { MeetingData } from './useMeetingData';
import MeetingListCard, { formatType } from './MeetingListCard';

export interface MeetingListProps extends MeetingData {
  activeProject: string | null;
  hasProject: boolean | null;
  hasFacilitator: boolean | null;
}

export default function MeetingList(props: MeetingListProps) {
  const {
    meetings,
    loading,
    fetchError,
    tagSummary,
    taggedMeetings,
    tagDetails,
    tagExpanded,
    pinnedMeetings,
    plannedMeetings,
    dismissedSuggestions,
    queuedSuggestions,
    error,
    statusFilter,
    searchQuery,
    focusedIndex,
    addingFacilitator,
    facilitatorError,
    suggestedExpanded,
    showPlanForm,
    planTopic,
    planType,
    sortedMeetings,
    tagCountsByMeeting,
    hasMultipleProjects,
    activeProject,
    hasProject,
    hasFacilitator,
    selectMeeting,
    setError,
    setStatusFilter,
    setSearchQuery,
    setUserExplicitlyBack,
    setFocusedIndex,
    setAddingFacilitator,
    setFacilitatorError,
    setHasFacilitator,
    setSuggestedExpanded,
    setDismissedSuggestions,
    setQueuedSuggestions,
    setTagExpanded,
    setTagDetails,
    setPlannedMeetings,
    setShowPlanForm,
    setPlanTopic,
    setPlanType,
    togglePin,
    deleteMeeting,
    bulkDeleteCompleted,
    projectParam,
  } = props;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Meetings
            </h1>
            {hasProject && activeProject && activeProject !== 'workspace' && (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {activeProject}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {meetings.some(m => m.status === 'complete') && (
              <button
                onClick={bulkDeleteCompleted}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-colors"
                style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Delete completed
              </button>
            )}
            {hasProject && hasFacilitator && (
              <button
                onClick={() => setShowPlanForm(!showPlanForm)}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-colors"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                + Plan meeting
              </button>
            )}
          </div>
        </div>

        {/* State-aware guidance -- only show after project state is known */}
        {hasProject === null ? null : hasProject === false ? (
          /* No project connected at all */
          <div
            className="rounded-lg p-6"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
          >
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              Connect a project to get started
            </p>
            <ol className="space-y-2 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex gap-3">
                <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>1</span>
                Connect your project — point us at the directory
              </li>
              <li className="flex gap-3">
                <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>2</span>
                Set up agents (or use your existing ones)
              </li>
              <li className="flex gap-3">
                <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>3</span>
                Ask Claude Code for a meeting — it shows up here live
              </li>
            </ol>
            <a
              href="/setup"
              className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Connect project
            </a>
            <a
              href="/guide"
              className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block ml-3"
              style={{ color: 'var(--text-muted)' }}
            >
              How it works
            </a>
          </div>
        ) : activeProject === 'workspace' ? (
          /* Projects exist but none selected */
          <div
            className="rounded-lg p-6"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              No project selected. Choose one from the dropdown above to view its meetings.
            </p>
          </div>
        ) : hasFacilitator === false ? (
          /* Project connected but no facilitator */
          <div
            className="rounded-lg px-5 py-4 mb-6 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--warning)', color: 'var(--text-secondary)' }}
          >
            <strong style={{ color: 'var(--warning)' }}>Your project needs a facilitator to run meetings.</strong>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
              The facilitator orchestrates rounds, picks participants, and produces summaries. Your existing agents stay untouched.
            </p>
            <div className="flex gap-3 mt-3">
              <button
                disabled={addingFacilitator}
                onClick={async () => {
                  setAddingFacilitator(true);
                  setFacilitatorError(null);
                  try {
                    const projRes = await fetch('/api/projects');
                    if (!projRes.ok) throw new Error('Could not load projects');
                    const projData = await projRes.json();
                    const active = projData.projects?.find((p: { name: string }) => p.name === projData.activeProject);
                    if (!active?.path) throw new Error('No active project path');
                    const res = await fetch('/api/setup/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        targetDir: active.path,
                        agents: [{ name: 'facilitator', template: 'facilitator', model: 'opus', description: 'Orchestrates meetings' }],
                        projectProfile: null,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || 'Failed to generate facilitator');
                    }
                    setHasFacilitator(true);
                  } catch (err) {
                    setFacilitatorError(err instanceof Error ? err.message : 'Failed to add facilitator');
                  } finally {
                    setAddingFacilitator(false);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {addingFacilitator ? 'Adding...' : 'Add facilitator'}
              </button>
              {facilitatorError && (
                <span className="text-xs" style={{ color: 'var(--error)' }}>{facilitatorError}</span>
              )}
              <a
                href={`/setup?scan=${encodeURIComponent(activeProject || '')}`}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Full setup
              </a>
            </div>
          </div>
        ) : (
          /* Ready — context-aware banner */
          <div
            className="rounded-lg px-5 py-4 mb-6 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {meetings.length > 0 && tagSummary ? (
              // Returning user — show context
              <div className="flex items-center gap-3 flex-wrap">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
                </span>
                {tagSummary.open > 0 && (
                  <>
                    <span>&middot;</span>
                    <span style={{ color: '#fbbf24' }}>{tagSummary.open} open question{tagSummary.open !== 1 ? 's' : ''}</span>
                  </>
                )}
                {tagSummary.actions > 0 && (
                  <>
                    <span>&middot;</span>
                    <span style={{ color: '#4ade80' }}>{tagSummary.actions} action{tagSummary.actions !== 1 ? 's' : ''}</span>
                  </>
                )}
                <span>&middot;</span>
                <a href="/roadmap" className="hover:underline" style={{ color: 'var(--accent)' }}>
                  View roadmap
                </a>
              </div>
            ) : (
              // New user — show hint
              <>
                <span style={{ color: 'var(--text-secondary)' }}>New meeting:</span>{' '}
                in Claude Code, ask for one — <em>&quot;run a meeting about the API design&quot;</em> or <em>&quot;let&apos;s have a design review on the dashboard&quot;</em>. It shows up here live.
              </>
            )}
          </div>
        )}

        {/* Planned meetings */}
        {plannedMeetings.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Planned ({plannedMeetings.length})
            </h2>
            <div className="space-y-2">
              {plannedMeetings.map(m => (
                <div
                  key={m.id}
                  className="rounded-lg px-4 py-3 text-sm flex items-center justify-between"
                  style={{ background: 'var(--bg-card)', border: '1px dashed var(--accent)', borderStyle: 'dashed' }}
                >
                  <div>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {m.type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className="mx-2" style={{ color: 'var(--text-muted)' }}>—</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{m.topic}</span>
                    {m.trigger && (
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>({m.trigger})</span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await fetch('/api/council/planned', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: m.id, status: 'dismissed' }),
                      });
                      setPlannedMeetings(prev => prev.filter(p => p.id !== m.id));
                    }}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan meeting form -- toggled by header button */}
        {showPlanForm && (
          <div
            className="rounded-lg p-4 space-y-3 mb-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
          >
            <div className="flex gap-2">
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value)}
                className="text-sm px-3 py-2 rounded outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="standup">Standup</option>
                <option value="design-review">Design Review</option>
                <option value="strategy">Strategy Session</option>
                <option value="architecture">Architecture Review</option>
                <option value="retrospective">Retrospective</option>
                <option value="sprint-planning">Sprint Planning</option>
                <option value="incident-review">Incident Review</option>
              </select>
              <input
                type="text"
                value={planTopic}
                onChange={(e) => setPlanTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && planTopic.trim()) {
                    fetch('/api/council/planned', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: planType, topic: planTopic.trim(), source: 'manual' }),
                    }).then(() => {
                      setPlanTopic('');
                      setShowPlanForm(false);
                      fetch('/api/council/planned').then(r => r.json()).then(d => setPlannedMeetings(d.meetings || []));
                    });
                  }
                  if (e.key === 'Escape') setShowPlanForm(false);
                }}
                placeholder="What should the meeting discuss?"
                className="flex-1 text-sm px-3 py-2 rounded outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowPlanForm(false)}
                className="text-sm px-3 py-1.5 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!planTopic.trim()) return;
                  fetch('/api/council/planned', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: planType, topic: planTopic.trim(), source: 'manual' }),
                  }).then(() => {
                    setPlanTopic('');
                    setShowPlanForm(false);
                    fetch('/api/council/planned').then(r => r.json()).then(d => setPlannedMeetings(d.meetings || []));
                  });
                }}
                className="text-sm px-4 py-1.5 rounded"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Plan meeting
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Claude picks up planned meetings via MCP. In your Claude Code session, it will see this and offer to run it.
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="loading-shimmer w-2 h-2 rounded-full" />
                  <div className="loading-shimmer h-4 rounded" style={{ width: `${140 + i * 30}px` }} />
                </div>
                <div className="ml-5 flex gap-2">
                  <div className="loading-shimmer h-3 w-20 rounded" />
                  <div className="loading-shimmer h-3 w-16 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div
            className="rounded-lg px-5 py-4 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--error)', color: 'var(--text-secondary)' }}
          >
            Could not load meetings. Check that the project directory exists and try refreshing.
          </div>
        ) : hasProject === false ? null : meetings.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No meetings yet. Try one of these in Claude Code:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { type: 'Standup', prompt: 'what should we work on today?' },
                { type: 'Strategy', prompt: 'let\'s discuss the roadmap' },
                { type: 'Design Review', prompt: 'review the login flow design' },
                { type: 'Architecture', prompt: 'review our API architecture' },
              ].map(s => (
                <div
                  key={s.type}
                  className="rounded-lg px-4 py-3 text-xs"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.type}</span>
                  <p className="mt-1 italic" style={{ color: 'var(--text-muted)' }}>&quot;{s.prompt}&quot;</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Cross-meeting tag summary -- expandable */}
            {tagSummary && (tagSummary.open > 0 || tagSummary.actions > 0 || tagSummary.decisions > 0) && (
              <div
                className="rounded-lg mb-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => {
                    const next = !tagExpanded;
                    setTagExpanded(next);
                    if (next && !tagDetails) {
                      Promise.all([
                        fetch('/api/meetings/tags?mode=unresolved').then(r => r.json()),
                        fetch('/api/meetings/tags?type=decision').then(r => r.json()),
                      ]).then(([unresolved, decisionData]) => {
                        setTagDetails({
                          decisions: decisionData.results || [],
                          open: unresolved.open || [],
                          actions: unresolved.actions || [],
                        });
                      }).catch(() => {});
                    }
                  }}
                  className="flex items-center gap-3 text-xs px-3 py-2 w-full cursor-pointer hover:brightness-110 transition-colors flex-wrap"
                >
                  {tagSummary.decisions > 0 && (
                    <span style={{ color: '#60a5fa' }}>
                      {tagSummary.decisions} decision{tagSummary.decisions !== 1 ? 's' : ''}
                    </span>
                  )}
                  {tagSummary.open > 0 && (
                    <span style={{ color: '#fbbf24' }}>
                      {tagSummary.open} open question{tagSummary.open !== 1 ? 's' : ''}
                    </span>
                  )}
                  {tagSummary.actions > 0 && (
                    <span style={{ color: '#4ade80' }}>
                      {tagSummary.actions} action{tagSummary.actions !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)' }}>
                    across {tagSummary.meetingCount} meeting{tagSummary.meetingCount !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {tagExpanded ? '\u25BE' : '\u25B8'}
                  </span>
                </button>
                {tagExpanded && tagDetails && (
                  <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                    {([
                      { key: 'decisions' as const, label: 'Decisions', color: '#60a5fa', border: 'rgba(96, 165, 250, 0.4)' },
                      { key: 'open' as const, label: 'Open Questions', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.4)' },
                      { key: 'actions' as const, label: 'Pending Actions', color: '#4ade80', border: 'rgba(74, 222, 128, 0.4)' },
                    ]).map(({ key, label, color, border }) => {
                      const items = tagDetails[key];
                      if (!items?.length) return null;
                      return (
                        <div key={key} className="pt-2">
                          <div className="text-xs font-medium mb-1.5" style={{ color }}>{label}</div>
                          {items.map((item, i) => (
                            <button
                              key={`${key}-${i}`}
                              onClick={() => {
                                const meetingFile = item.meeting.replace(/.*[\\/]/, '');
                                selectMeeting(meetingFile);
                                setTagExpanded(false);
                                setUserExplicitlyBack(false);
                              }}
                              className="block w-full text-left text-xs mb-1.5 pl-3 py-1.5 rounded hover:brightness-110 transition-colors"
                              style={{ color: 'var(--text-secondary)', borderLeft: `2px solid ${border}` }}
                            >
                              <span className="block">{item.text}</span>
                              <span className="flex items-center gap-1.5 mt-0.5">
                                {item.meetingStatus === 'in-progress' && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--live-green)' }} />
                                )}
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                  {item.meetingTitle ?? item.meeting.replace(/.*[\\/]/, '')}
                                  {item.meetingStatus === 'in-progress' ? ' \u00B7 live' : ''}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Suggested next meetings -- separate collapsible */}
            {(() => {
              const suggestions: { text: string; type?: string; topic?: string; source: string; sourceFile: string }[] = [];
              for (const m of meetings) {
                if (m.status === 'complete' && m.recommendedMeetings?.length) {
                  for (const rec of m.recommendedMeetings) {
                    const recText = typeof rec === 'string' ? rec : rec.text;
                    if (dismissedSuggestions.has(recText)) continue;
                    suggestions.push({
                      text: recText,
                      type: typeof rec === 'object' ? rec.type : undefined,
                      topic: typeof rec === 'object' ? rec.topic : undefined,
                      source: m.title || m.filename,
                      sourceFile: m.filename,
                    });
                  }
                }
              }
              if (!suggestions.length) return null;
              return (
                <div
                  className="rounded-lg mb-2"
                  style={{ background: 'var(--bg)', border: '1px solid rgba(167,139,250,0.3)' }}
                >
                  <button
                    onClick={() => setSuggestedExpanded(e => !e)}
                    className="flex items-center gap-3 text-xs px-3 py-2 w-full cursor-pointer hover:brightness-110 transition-colors"
                  >
                    <span style={{ color: '#a78bfa' }}>
                      {suggestions.length} suggested meeting{suggestions.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>from completed meeting summaries</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {suggestedExpanded ? '\u25BE' : '\u25B8'}
                    </span>
                  </button>
                  {suggestedExpanded && (
                    <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(167,139,250,0.2)' }}>
                      <div className="pt-2 space-y-1.5">
                        {suggestions.map((s, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <button
                              onClick={async () => {
                                const type = s.type ?? 'strategy-session';
                                const topic = s.topic ?? s.text;
                                await fetch('/api/council/planned', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ type, topic, source: s.sourceFile }),
                                }).catch(() => {});
                                fetch('/api/council/planned').then(r => r.json()).then(d => setPlannedMeetings(d.meetings || [])).catch(() => {});
                                await fetch(`/api/meetings/suggestions${projectParam()}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: s.text, action: 'queue' }),
                                }).catch(() => {});
                                setQueuedSuggestions(prev => new Set([...prev, s.text]));
                              }}
                              className="shrink-0 text-xs px-2 py-0.5 rounded transition-colors hover:brightness-110"
                              style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}
                            >
                              + Queue
                            </button>
                            <div className="min-w-0 flex-1">
                              <span className="block text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>{s.text.replace(/\*\*/g, '')}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>from {s.source}</span>
                            </div>
                            <button
                              onClick={async () => {
                                await fetch(`/api/meetings/suggestions${projectParam()}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: s.text }),
                                }).catch(() => {});
                                setDismissedSuggestions(prev => new Set([...prev, s.text]));
                              }}
                              className="shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors hover:brightness-110"
                              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                              title="Dismiss"
                            >
                              &#x2715;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Search and filter */}
            {meetings.length > 1 && (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, type, agent, or date..."
                className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            )}
            {meetings.length > 1 && (
              <div className="flex gap-2 mb-2">
                {(['all', 'in-progress', 'complete'] as const).map(f => {
                  const count = f === 'all' ? meetings.length : meetings.filter(m => m.status === f).length;
                  return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className="text-xs px-3 py-1 rounded-full transition-colors"
                    style={{
                      background: statusFilter === f ? 'var(--accent-muted)' : 'transparent',
                      color: statusFilter === f ? 'var(--accent)' : 'var(--text-muted)',
                      border: `1px solid ${statusFilter === f ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {f === 'all' ? 'All' : f === 'in-progress' ? 'Live' : 'Completed'}
                    {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
                  </button>
                  );
                })}
              </div>
            )}
            {error && (
              <div
                className="rounded-lg px-4 py-2 text-sm flex items-center justify-between"
                style={{ background: 'var(--error)', color: 'white' }}
              >
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-white/80 hover:text-white" aria-label="Dismiss error">&#x2715;</button>
              </div>
            )}
            {(() => {
              // Add date group headers between meetings
              const now = new Date();
              const todayStr = now.toISOString().slice(0, 10);
              const yesterday = new Date(now.getTime() - 86400000);
              const yesterdayStr = yesterday.toISOString().slice(0, 10);
              const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
              const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
              let lastGroup = '';
              const showGroups = !searchQuery && statusFilter === 'all' && sortedMeetings.length > 3;

              return sortedMeetings.map((m, i) => {
                const group = m.status === 'in-progress' ? 'live'
                  : pinnedMeetings.has(m.filename) ? 'pinned'
                  : m.date === todayStr ? 'today'
                  : m.date === yesterdayStr ? 'yesterday'
                  : (m.date && m.date >= weekAgo) ? 'this-week'
                  : (m.date && m.date >= monthAgo) ? 'this-month'
                  : 'older';
                const showHeader = showGroups && group !== lastGroup;
                lastGroup = group;
                const groupLabels: Record<string, string> = { live: 'Live', pinned: 'Pinned', today: 'Today', yesterday: 'Yesterday', 'this-week': 'This Week', 'this-month': 'This Month', older: 'Older' };

                return (
                  <div key={m.filename}>
                    {showHeader && group !== 'live' && group !== 'pinned' && (
                      <div className="text-xs font-medium uppercase tracking-wider px-1 pt-4 pb-1" style={{ color: 'var(--text-muted)' }}>
                        {groupLabels[group] || group}
                      </div>
                    )}
                    <MeetingListCard
                      meeting={m}
                      onSelect={(filename) => { selectMeeting(filename); setUserExplicitlyBack(false); setFocusedIndex(null); }}
                      onDelete={deleteMeeting}
                      taggedMeetings={taggedMeetings}
                      hasMultipleProjects={hasMultipleProjects}
                      focused={focusedIndex === i}
                      tagCounts={tagCountsByMeeting[m.filename]}
                      pinned={pinnedMeetings.has(m.filename)}
                      onTogglePin={togglePin}
                    />
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        {meetings.length > 0 && (
          <div className="mt-6 text-xs text-center" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>j</kbd>
            {' / '}
            <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>k</kbd>
            {' navigate \u00B7 '}
            <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>enter</kbd>
            {' select \u00B7 '}
            <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>esc</kbd>
            {' go back'}
          </div>
        )}
      </div>
    </div>
  );
}
