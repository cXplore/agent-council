'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAgentColor } from '@/lib/utils';
import { createMeetingComponents } from '@/lib/md-components';
import { getContentForRound } from '@/lib/meeting-utils';
import MeetingOutcomes, { countOutcomes } from './MeetingOutcomes';
import MeetingCompletionCard from './MeetingCompletionCard';
import { formatType, formatDuration, ProjectBadge } from './MeetingListCard';
import type { MeetingData } from './useMeetingData';

const mdComponents = createMeetingComponents(getAgentColor);

export interface MeetingDetailProps extends MeetingData {
  activeProject: string | null;
  onBack: () => void;
}

export default function MeetingDetail(props: MeetingDetailProps) {
  const {
    selected,
    detail,
    seenContent,
    recentlyUpdated,
    connectionLost,
    pollPaused,
    dismissedSuggestions,
    queuedSuggestions,
    error,
    userScrolledUp,
    chatInput,
    sending,
    copied,
    linkPreview,
    outcomesOpen,
    queuedRecs,
    viewRound,
    showContribDetails,
    showTerms,
    meetingTerms,
    notesOpen,
    noteText,
    latestEvent,
    contextCards,
    paceMode,
    meetingSearchOpen,
    meetingSearch,
    meetingSearchIndex,
    meetingSearchRef,
    contentRef,
    activeProject,
    onBack,
    projectParam,
    setError,
    setChatInput,
    setCopied,
    setLinkPreview,
    setOutcomesOpen,
    setQueuedRecs,
    setDismissedSuggestions,
    setQueuedSuggestions,
    setViewRound,
    setShowContribDetails,
    setShowTerms,
    setMeetingTerms,
    setNotesOpen,
    setPaceMode,
    setPollPaused,
    setPlannedMeetings,
    setMeetingSearchOpen,
    setMeetingSearch,
    setMeetingSearchIndex,
    handleScroll,
    handleNoteChange,
    handleNoteBlur,
    scrollToBottom,
    sendMessage,
    windowFind,
  } = props;

  const isLive = detail?.status === 'in-progress';
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 px-6 py-3 flex items-center gap-4 min-w-0"
        style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={onBack}
          className="text-sm hover:underline shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          &larr; All meetings
        </button>

        {detail && (
          <>
            {detail.project && (
              <ProjectBadge project={detail.project} />
            )}

            <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
              {detail.title || formatType(detail.type)}
            </span>

            <div className="relative">
              <button
                onClick={async () => {
                  const link = window.location.origin + '/meetings?file=' + encodeURIComponent(detail.filename);
                  await navigator.clipboard.writeText(link);
                  setCopied('link');
                  setLinkPreview(true);
                  setTimeout(() => setCopied(null), 1500);
                  setTimeout(() => setLinkPreview(false), 3000);
                }}
                className="text-xs px-2 py-0.5 rounded transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                title="Copy meeting link to clipboard"
              >
                {copied === 'link' ? 'Copied!' : 'Copy link'}
              </button>

              {linkPreview && (
                <div
                  className="absolute right-0 top-full mt-2 z-50 rounded-lg p-3 text-xs w-64"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div className="font-medium mb-1 truncate">
                    {detail.title || formatType(detail.type)}
                  </div>
                  <div className="mb-1" style={{ color: 'var(--text-muted)' }}>
                    {formatType(detail.type)} &middot; {detail.date || 'No date'}
                  </div>
                  <div className="mb-2" style={{ color: 'var(--text-muted)' }}>
                    {detail.participants.length} agent{detail.participants.length !== 1 ? 's' : ''} participated
                  </div>
                  <div
                    className="truncate font-mono text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                  >
                    {window.location.origin}/meetings?file=...
                  </div>
                </div>
              )}
            </div>

            {isLive ? (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ background: 'var(--live-green)' }}
                title="Meeting in progress"
              />
            ) : detail && (
              <>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Completed
                </span>
                {detail.content?.includes('## Summary') && (
                  <button
                    onClick={async () => {
                      const summaryMatch = detail.content?.match(/## Summary[\s\S]*$/);
                      if (summaryMatch) {
                        await navigator.clipboard.writeText(summaryMatch[0]);
                        setCopied('summary');
                        setTimeout(() => setCopied(null), 1500);
                      }
                    }}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}
                    title="Copy the summary section to clipboard"
                  >
                    {copied === 'summary' ? 'Copied!' : 'Copy summary'}
                  </button>
                )}
                {/* Export / secondary actions dropdown */}
                <div ref={exportMenuRef} className="relative">
                  <button
                    onClick={() => setExportMenuOpen(v => !v)}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    title="Export and more actions"
                  >
                    ···
                  </button>
                  {exportMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 rounded-lg py-1 min-w-[160px]"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                    >
                      {detail.content?.includes('## Summary') && (
                        <button
                          onClick={async () => {
                            if (!detail?.content) return;
                            const OUTCOME_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;
                            const summarySection = detail.content.match(/## Summary[\s\S]*$/);
                            const decisions: string[] = [];
                            const open: string[] = [];
                            const actions: string[] = [];
                            if (summarySection) {
                              for (const line of summarySection[0].split('\n')) {
                                const m = line.match(OUTCOME_REGEX);
                                if (m) {
                                  const tag = m[1].toUpperCase();
                                  const text = m[3].trim();
                                  if (tag === 'DECISION' || tag === 'RESOLVED') decisions.push(text);
                                  else if (tag === 'OPEN') open.push(text);
                                  else if (tag === 'ACTION') actions.push(text);
                                }
                              }
                            }
                            const wordCount = detail.wordCount ?? detail.content.split(/\s+/).filter(Boolean).length;
                            const duration = detail.started && detail.modifiedAt
                              ? formatDuration(detail.started, detail.modifiedAt)
                              : null;
                            const lines: string[] = [];
                            lines.push(`\u{1F4CB} ${detail.title || formatType(detail.type)}`);
                            const metaParts = [detail.date || 'No date', formatType(detail.type), `${detail.participants.length} agents`];
                            lines.push(`\u{1F4C5} ${metaParts.join(' \u00B7 ')}`);
                            const timeParts = [duration, `${wordCount.toLocaleString()} words`].filter(Boolean);
                            lines.push(`\u23F1 ${timeParts.join(' \u00B7 ')}`);
                            if (decisions.length > 0) {
                              lines.push('');
                              lines.push('\u{1F3AF} Decisions:');
                              decisions.forEach(d => lines.push(`\u2022 ${d}`));
                            }
                            if (open.length > 0) {
                              lines.push('');
                              lines.push('\u2753 Open Questions:');
                              open.forEach(q => lines.push(`\u2022 ${q}`));
                            }
                            if (actions.length > 0) {
                              lines.push('');
                              lines.push('\u2705 Actions:');
                              actions.forEach(a => lines.push(`\u2022 ${a}`));
                            }
                            if (decisions.length === 0 && open.length === 0 && actions.length === 0) {
                              lines.push('');
                              lines.push('No tagged outcomes found in summary.');
                            }
                            await navigator.clipboard.writeText(lines.join('\n'));
                            setCopied('digest');
                            setTimeout(() => setCopied(null), 1500);
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-left text-xs px-3 py-1.5 hover:brightness-125 transition-colors"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {copied === 'digest' ? 'Copied!' : 'Copy digest'}
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (!detail?.content) return;
                          await navigator.clipboard.writeText(detail.content);
                          setCopied('all');
                          setTimeout(() => setCopied(null), 1500);
                          setExportMenuOpen(false);
                        }}
                        className="w-full text-left text-xs px-3 py-1.5 hover:brightness-125 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {copied === 'all' ? 'Copied!' : 'Copy all'}
                      </button>
                      <button
                        onClick={() => {
                          if (!detail?.content) return;
                          const blob = new Blob([detail.content], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = detail.filename || 'meeting.md';
                          a.click();
                          URL.revokeObjectURL(url);
                          setExportMenuOpen(false);
                        }}
                        className="w-full text-left text-xs px-3 py-1.5 hover:brightness-125 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Download .md
                      </button>
                      <a
                        href={`/api/meetings/export/html?file=${encodeURIComponent(detail.filename)}${activeProject ? `&project=${encodeURIComponent(activeProject)}` : ''}`}
                        className="block text-xs px-3 py-1.5 hover:brightness-125 transition-colors"
                        style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
                        download
                        onClick={() => setExportMenuOpen(false)}
                      >
                        Export HTML
                      </a>
                      <button
                        onClick={() => { window.print(); setExportMenuOpen(false); }}
                        className="w-full text-left text-xs px-3 py-1.5 hover:brightness-125 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Print
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Notes toggle -- available for both live and completed meetings */}
            <button
              onClick={() => setNotesOpen(!notesOpen)}
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{
                color: notesOpen ? 'var(--accent)' : (noteText.trim() ? 'var(--text-primary)' : 'var(--text-muted)'),
                border: `1px solid ${notesOpen ? 'var(--accent)' : 'var(--border)'}`,
              }}
              title={notesOpen ? 'Hide personal notes' : 'Show personal notes'}
            >
              {noteText.trim() ? 'Notes *' : 'Notes'}
            </button>
          </>
        )}
      </div>

      {/* Live status banner — prominent phase indicator for in-progress meetings */}
      {isLive && detail && (() => {
        const phaseIcon = connectionLost ? null
          : latestEvent?.includes('starting') ? '\u25B6'
          : latestEvent?.includes('thinking') ? '\u270D'
          : latestEvent?.includes('complete') ? '\u2714'
          : '\u23F3';
        return (
          <div
            className="px-6 py-2.5 flex items-center gap-3"
            style={{
              background: connectionLost
                ? 'rgba(234, 179, 8, 0.08)'
                : 'rgba(34, 197, 94, 0.08)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${connectionLost ? '' : 'animate-pulse'}`}
              style={{ background: connectionLost ? 'var(--warning)' : 'var(--live-green)' }}
            />
            {connectionLost ? (
              <span className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
                Connection lost — retrying...
              </span>
            ) : (
              <span className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--live-green)' }}>
                {phaseIcon && <span className="text-xs">{phaseIcon}</span>}
                {latestEvent || 'Meeting in progress'}
              </span>
            )}
            {pollPaused && (
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                Auto-refresh paused
              </span>
            )}
          </div>
        );
      })()}

      {/* Objective bar — shows the meeting's falsifiable objective when present */}
      {detail && (() => {
        const obj = detail.objective || detail.content?.match(/<!--\s*objective:\s*"?(.+?)"?\s*-->/)?.[1];
        if (!obj) return null;
        return (
          <div
            className="px-6 py-2 text-xs flex items-center gap-2"
            style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Objective:</span>
            <span style={{ color: 'var(--text-secondary)' }}>{obj}</span>
          </div>
        );
      })()}

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
          {detail.participants.map((p) => {
            const hasSpoken = detail.content?.includes(`**${p}:**`) ?? false;
            const initial = p.charAt(0).toUpperCase();
            const color = getAgentColor(p);
            return (
              <a
                key={p}
                href={`/agents?agent=${encodeURIComponent(p)}`}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:brightness-125 transition-all cursor-pointer"
                style={{
                  color,
                  background: `${color.replace(')', ', 0.12)').replace('hsl(', 'hsla(')}`,
                  opacity: hasSpoken ? 1 : 0.4,
                }}
                title={hasSpoken ? `${p} has spoken \u2014 click to view profile` : `${p} \u2014 waiting to speak`}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full text-xs font-bold"
                  style={{ width: 16, height: 16, background: color, color: '#0a0a0b', fontSize: '0.6rem' }}
                >
                  {initial}
                </span>
                {p}
              </a>
            );
          })}
        </div>
      )}

      {/* Meeting stats for completed meetings */}
      {detail && detail.status === 'complete' && detail.content && (() => {
        const wordCounts: Record<string, number> = {};
        // Only match agent turn headings: "### AgentName (Round N)" — this excludes all context/summary sections
        const headingBlocks = detail.content.split(/^###\s+(.+?)\s+\(Round\s+\d+\)$/m);
        if (headingBlocks.length > 1) {
          for (let i = 1; i < headingBlocks.length; i += 2) {
            const name = headingBlocks[i].trim();
            const text = headingBlocks[i + 1] || '';
            const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
            if (name) {
              wordCounts[name] = (wordCounts[name] || 0) + words;
            }
          }
        }
        if (Object.keys(wordCounts).length === 0) {
          const agentBlocks = detail.content.split(/\*\*([\w-]+):\*\*/);
          for (let i = 1; i < agentBlocks.length; i += 2) {
            const name = agentBlocks[i];
            const text = agentBlocks[i + 1] || '';
            const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
            wordCounts[name] = (wordCounts[name] || 0) + words;
          }
        }
        const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0);
        const rounds = (detail.content.match(/^(?:## Round \d+|\*Round \d+)/gm) || []).length;
        if (totalWords === 0) return null;

        return (
          <>
          <div
            className="px-6 py-2 flex items-center gap-4 text-xs flex-wrap"
            style={{ borderBottom: (showContribDetails || showTerms) ? 'none' : '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <span>{totalWords.toLocaleString()} words (~{Math.ceil(totalWords / 250)} min read)</span>
            <span>{rounds} round{rounds !== 1 ? 's' : ''}</span>
            <span>{Object.keys(wordCounts).length} agents</span>
            <div className="flex-1" />
            {/* Mini contribution bar (clickable) */}
            <button
              onClick={() => setShowContribDetails(!showContribDetails)}
              className="flex h-2.5 rounded-full overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
              style={{ width: 120, border: 'none', padding: 0, background: 'transparent' }}
              title="Click to show contribution details"
            >
              {Object.entries(wordCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <div
                    key={name}
                    style={{
                      width: `${(count / totalWords) * 100}%`,
                      background: getAgentColor(name),
                    }}
                  />
                ))}
            </button>
            {/* Outcomes toggle */}
            {(() => {
              const count = detail?.content ? countOutcomes(detail.content) : 0;
              if (count === 0 && !isLive) return null;
              return (
                <button
                  onClick={() => setOutcomesOpen(!outcomesOpen)}
                  className="text-xs px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    background: outcomesOpen ? 'rgba(96, 165, 250, 0.15)' : 'var(--bg)',
                    color: outcomesOpen ? '#60a5fa' : 'var(--text-muted)',
                    border: `1px solid ${outcomesOpen ? 'rgba(96, 165, 250, 0.3)' : 'var(--border)'}`,
                  }}
                  title={isLive ? 'Tags appear as agents write them. Final counts shown after meeting completes.' : undefined}
                >
                  {isLive
                    ? 'Outcomes — updating live'
                    : `Outcomes (${count})`
                  }
                </button>
              );
            })()}
            {/* Terms toggle */}
            <button
              onClick={async () => {
                const next = !showTerms;
                setShowTerms(next);
                if (next && !meetingTerms && selected) {
                  try {
                    const res = await fetch(`/api/meetings/terms?file=${encodeURIComponent(selected)}`);
                    if (res.ok) {
                      const data = await res.json();
                      setMeetingTerms(data.terms ?? []);
                    }
                  } catch { /* ignore */ }
                }
              }}
              className="text-xs px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: showTerms ? 'rgba(96, 165, 250, 0.15)' : 'var(--bg)',
                color: showTerms ? '#60a5fa' : 'var(--text-muted)',
                border: `1px solid ${showTerms ? 'rgba(96, 165, 250, 0.3)' : 'var(--border)'}`,
              }}
            >
              Terms
            </button>
          </div>
          {/* Expandable contribution details */}
          {showContribDetails && (
            <div
              className="px-6 py-3 text-xs"
              style={{ borderBottom: showTerms ? 'none' : '1px solid var(--border)', background: 'var(--bg)' }}
            >
              <div className="space-y-1.5" style={{ maxWidth: 420 }}>
                {Object.entries(wordCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => {
                    const pct = Math.round((count / totalWords) * 100);
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-28 truncate font-medium" style={{ color: 'var(--text-secondary)' }}>{name}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: getAgentColor(name) }}
                          />
                        </div>
                        <span className="w-24 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {pct}% ({count.toLocaleString()})
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {/* Key terms word cloud */}
          {showTerms && meetingTerms && meetingTerms.length > 0 && (() => {
            const maxCount = Math.max(...meetingTerms.map(t => t.count));
            return (
              <div className="flex flex-wrap gap-2 items-center px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                {meetingTerms.map(t => (
                  <span key={t.word} style={{
                    fontSize: Math.max(11, Math.min(22, 11 + t.count / maxCount * 14)),
                    color: getAgentColor(t.word),
                    opacity: 0.5 + (t.count / maxCount) * 0.5,
                  }}>
                    {t.word}
                  </span>
                ))}
              </div>
            );
          })()}
          </>
        );
      })()}

      {/* Recommended next meetings from summary */}
      {detail && detail.status === 'complete' && detail.recommendedMeetings && detail.recommendedMeetings.length > 0 && (
        <div
          className="px-6 py-3 text-sm"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}
        >
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Recommended next meetings:</div>
          <div className="flex flex-wrap gap-2">
            {detail.recommendedMeetings.map((rec, i) => {
              const recText = typeof rec === 'string' ? rec : rec.text;
              const recType = typeof rec === 'object' ? rec.type : undefined;
              const recTopic = typeof rec === 'object' ? rec.topic : undefined;
              const isDismissed = dismissedSuggestions.has(recText);
              const isQueued = queuedSuggestions.has(recText) || queuedRecs.has(i);
              return (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      if (isQueued || isDismissed) return;
                      const type = recType ?? (() => {
                        const clean = recText.replace(/\*\*/g, '').trim();
                        const m = clean.match(/^([^—\u2013:]+)[—\u2013]/) ?? clean.match(/^([^:]+):/);
                        return m ? m[1].trim().toLowerCase().replace(/\s+/g, '-') : 'strategy-session';
                      })();
                      const topic = recTopic ?? (() => {
                        const clean = recText.replace(/\*\*/g, '').trim();
                        const m = clean.match(/^[^—\u2013:]+[—\u2013:]\s*(.+)/);
                        return m ? m[1].trim() : clean;
                      })();
                      try {
                        await fetch('/api/council/planned', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: 'recommended', topic, meetingType: type, source: detail.filename }),
                        });
                        await fetch(`/api/meetings/suggestions${projectParam()}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: recText, action: 'queue' }),
                        });
                        setQueuedSuggestions(prev => new Set([...prev, recText]));
                        setQueuedRecs(prev => new Set([...prev, i]));
                      } catch {}
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:brightness-110"
                    style={{
                      background: isQueued ? 'var(--bg-elevated)' : isDismissed ? 'var(--bg)' : 'var(--bg-card)',
                      color: isQueued || isDismissed ? 'var(--text-muted)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      textDecoration: isDismissed || isQueued ? 'line-through' : undefined,
                      cursor: isQueued || isDismissed ? 'default' : undefined,
                    }}
                    title={isQueued ? 'Added to planned meetings' : isDismissed ? 'Dismissed' : 'Add to planned meetings'}
                  >
                    {isQueued ? '\u2713 Queued' : `+ ${recText.replace(/\*\*/g, '')}`}
                  </button>
                  {!queuedRecs.has(i) && (
                    <button
                      onClick={async () => {
                        const p = projectParam();
                        const sep = p ? '&' : '?';
                        await fetch(
                          isDismissed
                            ? `/api/meetings/suggestions${p}${sep}text=${encodeURIComponent(recText)}`
                            : `/api/meetings/suggestions${p}`,
                          isDismissed
                            ? { method: 'DELETE' }
                            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: recText }) }
                        ).catch(() => {});
                        if (isDismissed) {
                          setDismissedSuggestions(prev => { const n = new Set(prev); n.delete(recText); return n; });
                        } else {
                          setDismissedSuggestions(prev => new Set([...prev, recText]));
                        }
                      }}
                      className="text-xs px-1.5 py-1.5 rounded-lg transition-colors hover:brightness-110"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      title={isDismissed ? 'Restore' : 'Dismiss'}
                    >
                      {isDismissed ? '\u21A9' : '\u2715'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completion card -- shown at top of completed meetings */}
      {detail && detail.status === 'complete' && (
        <MeetingCompletionCard
          content={detail.content}
          recommendedMeetings={detail.recommendedMeetings}
          dismissedSuggestions={dismissedSuggestions}
          queuedSuggestions={queuedSuggestions}
          onQueue={async (type, topic, text) => {
            await fetch('/api/council/planned', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'recommended', topic, meetingType: type, source: detail.filename }),
            }).catch(() => {});
            fetch('/api/council/planned').then(r => r.json()).then(d => setPlannedMeetings(d.meetings || [])).catch(() => {});
            if (text) {
              await fetch(`/api/meetings/suggestions${projectParam()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, action: 'queue' }),
              }).catch(() => {});
              setQueuedSuggestions(prev => new Set([...prev, text]));
            }
          }}
          onDismiss={async (text) => {
            await fetch(`/api/meetings/suggestions${projectParam()}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            }).catch(() => {});
            setDismissedSuggestions(prev => new Set([...prev, text]));
          }}
        />
      )}

      {/* Content + Outcomes panel wrapper */}
      <div className="flex flex-1 overflow-hidden">

      {/* Content area */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-8 relative"
      >
        {/* Round navigation bar */}
        {detail && detail.content && (() => {
          const rounds = detail.content.match(/^(?:## Round \d+|\*Round \d+)/gm);
          const hasSummary = detail.content.includes('## Summary');
          if (!rounds && !hasSummary) return null;
          const agentsByRound: Record<number, string[]> = {};
          for (const m of detail.content.matchAll(/^### (.+?) \(Round (\d+)\)/gm)) {
            const rn = parseInt(m[2], 10);
            if (!agentsByRound[rn]) agentsByRound[rn] = [];
            agentsByRound[rn].push(m[1]);
          }
          const abbrev = (name: string) => {
            const map: Record<string, string> = { 'project-manager': 'PM', 'north-star': 'NS', facilitator: 'Fac' };
            return map[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1, 4);
          };
          return (
            <div
              className="sticky top-0 z-20 flex items-center gap-1 px-3 py-2 mb-4 -mx-6 -mt-8 rounded-b-lg"
              style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
            >
              {viewRound !== null && (
                <button
                  onClick={() => setViewRound(null)}
                  className="text-xs px-2.5 py-1.5 rounded-md transition-colors mr-1"
                  style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                  aria-label="Show all rounds"
                >
                  All
                </button>
              )}
              {rounds?.map((_r, i) => {
                const roundNum = i + 1;
                const agents = agentsByRound[roundNum] || [];
                const isActive = viewRound === roundNum;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isActive) { setViewRound(null); } else {
                        setViewRound(roundNum);
                        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
                    style={isActive
                      ? { background: 'var(--accent)', color: 'white' }
                      : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                    }
                    title={isActive ? `Showing Round ${roundNum} only` : `Round ${roundNum}: ${agents.join(', ')}`}
                    aria-label={`${isActive ? 'Viewing' : 'View'} Round ${roundNum} (${agents.length} agents)`}
                  >
                    <span className="font-medium" style={{ color: isActive ? 'white' : 'var(--text)' }}>R{roundNum}</span>
                    {agents.length > 0 && (
                      <span style={{ opacity: 0.7, marginLeft: 4 }}>
                        {agents.map(a => abbrev(a)).join(', ')}
                      </span>
                    )}
                  </button>
                );
              })}
              {hasSummary && (
                <button
                  onClick={() => {
                    setViewRound(null);
                    requestAnimationFrame(() => {
                      const headings = contentRef.current?.querySelectorAll('h2');
                      Array.from(headings || []).find(h => h.textContent?.trim() === 'Summary')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
                  style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                  aria-label="Jump to Summary"
                >
                  Summary
                </button>
              )}
            </div>
          );
        })()}

        {/* In-meeting text search bar */}
        {meetingSearchOpen && detail && (
          <div
            className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 rounded-lg mb-4 shadow-lg"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={meetingSearchRef}
              type="text"
              value={meetingSearch}
              onChange={(e) => {
                setMeetingSearch(e.target.value);
                setMeetingSearchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setMeetingSearchOpen(false);
                  setMeetingSearch('');
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const content = detail?.content || '';
                  const query = meetingSearch.toLowerCase();
                  if (!query) return;
                  const matches: number[] = [];
                  let idx = content.toLowerCase().indexOf(query);
                  while (idx !== -1) {
                    matches.push(idx);
                    idx = content.toLowerCase().indexOf(query, idx + 1);
                  }
                  if (matches.length === 0) return;
                  const nextIndex = e.shiftKey
                    ? (meetingSearchIndex - 1 + matches.length) % matches.length
                    : (meetingSearchIndex + 1) % matches.length;
                  setMeetingSearchIndex(nextIndex);
                  if (contentRef.current) {
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    contentRef.current.focus();
                    windowFind(meetingSearch, false, e.shiftKey);
                  }
                }
              }}
              placeholder="Search in meeting..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--text-primary)' }}
              autoFocus
            />
            {/* Match count */}
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
              {(() => {
                if (!meetingSearch) return '';
                const content = detail?.content || '';
                const query = meetingSearch.toLowerCase();
                let count = 0;
                let idx = content.toLowerCase().indexOf(query);
                while (idx !== -1) {
                  count++;
                  idx = content.toLowerCase().indexOf(query, idx + 1);
                }
                if (count === 0) return 'No matches';
                return `${meetingSearchIndex + 1} of ${count} match${count !== 1 ? 'es' : ''}`;
              })()}
            </span>
            {/* Prev / Next buttons */}
            <button
              onClick={() => {
                const content = detail?.content || '';
                const query = meetingSearch.toLowerCase();
                if (!query) return;
                let count = 0;
                let idx = content.toLowerCase().indexOf(query);
                while (idx !== -1) { count++; idx = content.toLowerCase().indexOf(query, idx + 1); }
                if (count === 0) return;
                const prev = (meetingSearchIndex - 1 + count) % count;
                setMeetingSearchIndex(prev);
                if (contentRef.current) {
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  contentRef.current.focus();
                  windowFind(meetingSearch, false, true);
                  meetingSearchRef.current?.focus();
                }
              }}
              className="p-1 rounded hover:brightness-125 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Previous match (Shift+Enter)"
              aria-label="Previous match"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
            <button
              onClick={() => {
                const content = detail?.content || '';
                const query = meetingSearch.toLowerCase();
                if (!query) return;
                let count = 0;
                let idx = content.toLowerCase().indexOf(query);
                while (idx !== -1) { count++; idx = content.toLowerCase().indexOf(query, idx + 1); }
                if (count === 0) return;
                const next = (meetingSearchIndex + 1) % count;
                setMeetingSearchIndex(next);
                if (contentRef.current) {
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  contentRef.current.focus();
                  windowFind(meetingSearch);
                  meetingSearchRef.current?.focus();
                }
              }}
              className="p-1 rounded hover:brightness-125 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Next match (Enter)"
              aria-label="Next match"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {/* Close button */}
            <button
              onClick={() => { setMeetingSearchOpen(false); setMeetingSearch(''); }}
              className="p-1 rounded hover:brightness-125 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Close (Escape)"
              aria-label="Close search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}

        {/* Round navigation bar removed — now inline above content */}
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
                const fullClean = detail.content.replace(/<!--[\s\S]*?-->\n?/g, '');
                const clean = viewRound !== null ? getContentForRound(fullClean, viewRound) : fullClean;
                const cleanSeen = seenContent.replace(/<!--[\s\S]*?-->\n?/g, '');
                const hasNew = clean.length > cleanSeen.length && cleanSeen.length > 0;
                let splitIdx = cleanSeen.length;
                if (hasNew) {
                  const dblNlIdx = clean.lastIndexOf('\n\n', splitIdx);
                  if (dblNlIdx > 0) {
                    splitIdx = dblNlIdx + 2;
                  } else {
                    const nlIdx = clean.lastIndexOf('\n', splitIdx);
                    if (nlIdx > 0) splitIdx = nlIdx + 1;
                  }
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

              {/* MCP-pushed context cards */}
              {contextCards.length > 0 && (
                <div className="mt-6 space-y-2">
                  {contextCards.map(card => (
                    <div
                      key={card.id}
                      className="rounded-lg px-4 py-3 text-sm"
                      style={{ background: 'rgba(124, 109, 216, 0.08)', border: '1px solid rgba(124, 109, 216, 0.2)' }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                          Context from Claude
                        </span>
                        {card.source && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            via {card.source}
                          </span>
                        )}
                      </div>
                      <p style={{ color: 'var(--text-secondary)' }}>{card.context}</p>
                    </div>
                  ))}
                </div>
              )}

              {isLive && (
                <div className="mt-8 flex items-center gap-2">
                  {connectionLost ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warning)' }} />
                      <span className="text-xs" style={{ color: 'var(--warning)' }}>
                        Connection lost — retrying...
                      </span>
                    </>
                  ) : pollPaused ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Auto-refresh paused
                      </span>
                      <button
                        onClick={() => setPollPaused(false)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}
                      >
                        Resume
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${recentlyUpdated ? 'animate-ping' : 'animate-pulse'}`}
                        style={{ background: recentlyUpdated ? 'var(--live-green)' : 'var(--accent)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {recentlyUpdated ? 'New response received' : latestEvent || 'Watching for updates...'}
                      </span>
                      <button
                        onClick={() => setPollPaused(true)}
                        className="text-xs px-2 py-0.5 rounded opacity-0 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        title="Pause auto-refresh"
                      >
                        Pause
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Outcomes panel */}
      {detail && (
        <MeetingOutcomes
          content={detail.content}
          open={outcomesOpen}
          isLive={isLive}
          onClose={() => setOutcomesOpen(false)}
        />
      )}

      </div>{/* End Content + Outcomes wrapper */}

      {/* Collapsible personal notes section */}
      {notesOpen && (
        <div
          className="px-6 py-3"
          style={{
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Personal Notes
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                Saved to this browser
              </span>
            </div>
            <textarea
              value={noteText}
              onChange={handleNoteChange}
              onBlur={handleNoteBlur}
              placeholder="Write your notes about this meeting..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                minHeight: '80px',
                maxHeight: '300px',
              }}
            />
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="px-6 py-2 text-sm flex items-center justify-between"
          style={{ background: 'var(--error)', color: 'white' }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-white/80 hover:text-white" aria-label="Dismiss error">&#x2715;</button>
        </div>
      )}

      {/* Chat input + pace control for live meetings */}
      {isLive && (
        <div
          className="sticky bottom-0 px-6 py-3"
          style={{
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {/* Pace control bar */}
          <div className="max-w-3xl mx-auto flex items-center gap-2 mb-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Pacing:</span>
            <button
              onClick={() => {
                fetch('/api/council/pace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting: selected, action: 'set-auto' }) });
                setPaceMode('auto');
              }}
              className="text-xs px-2.5 py-1 rounded transition-colors"
              style={{
                background: paceMode === 'auto' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: paceMode === 'auto' ? 'var(--accent)' : 'var(--text-muted)',
                border: paceMode === 'auto' ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}
              title="Facilitator proceeds automatically between rounds"
            >
              Auto
            </button>
            <button
              onClick={() => {
                fetch('/api/council/pace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting: selected, action: 'set-guided' }) });
                setPaceMode('guided');
              }}
              className="text-xs px-2.5 py-1 rounded transition-colors"
              style={{
                background: paceMode === 'guided' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: paceMode === 'guided' ? 'var(--accent)' : 'var(--text-muted)',
                border: paceMode === 'guided' ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}
              title="Facilitator waits for your approval before each round"
            >
              Guided
            </button>
            <button
              onClick={() => {
                fetch('/api/council/pace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting: selected, action: 'proceed' }) });
              }}
              className="text-xs px-3 py-1 rounded-lg font-medium transition-colors"
              style={{ background: 'var(--live-green)', color: '#0a0a0b' }}
              title="Signal the facilitator to proceed to the next round"
            >
              ▶ Proceed
            </button>
          </div>
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
