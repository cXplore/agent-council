'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { MeetingListItem, MeetingDetail } from '@/lib/types';

const POLL_INTERVAL = 2000;

export interface MeetingData {
  // Core data
  meetings: MeetingListItem[];
  selected: string | null;
  detail: MeetingDetail | null;
  loading: boolean;
  fetchError: boolean;

  // Content tracking
  seenContent: string;
  recentlyUpdated: boolean;
  connectionLost: boolean;
  pollPaused: boolean;

  // Tag data
  tagSummary: { decisions: number; open: number; actions: number; meetingCount: number } | null;
  taggedMeetings: Set<string>;
  tagDetails: { decisions: { text: string; meeting: string; meetingTitle?: string; meetingStatus?: string }[]; open: { text: string; meeting: string; meetingTitle?: string; meetingStatus?: string }[]; actions: { text: string; meeting: string; meetingTitle?: string; meetingStatus?: string }[] } | null;
  tagExpanded: boolean;

  // Pinned / planned / suggestions
  pinnedMeetings: Set<string>;
  plannedMeetings: { id: string; type: string; topic: string; trigger?: string; source?: string }[];
  dismissedSuggestions: Set<string>;
  queuedSuggestions: Set<string>;

  // UI state
  error: string | null;
  statusFilter: 'all' | 'in-progress' | 'complete';
  searchQuery: string;
  focusedIndex: number | null;
  userScrolledUp: boolean;
  userExplicitlyBack: boolean;

  // Detail view state
  chatInput: string;
  sending: boolean;
  copied: 'summary' | 'all' | 'link' | 'digest' | null;
  linkPreview: boolean;
  outcomesOpen: boolean;
  addingFacilitator: boolean;
  facilitatorError: string | null;
  queuedRecs: Set<number>;
  suggestedExpanded: boolean;
  viewRound: number | null;
  showContribDetails: boolean;
  showTerms: boolean;
  meetingTerms: { word: string; count: number }[] | null;
  notesOpen: boolean;
  noteText: string;
  latestEvent: string | null;
  contextCards: { id: string; context: string; source?: string; timestamp: string }[];
  showPlanForm: boolean;
  planTopic: string;
  planType: string;

  // In-meeting search
  meetingSearchOpen: boolean;
  meetingSearch: string;
  meetingSearchIndex: number;
  meetingSearchRef: React.RefObject<HTMLInputElement | null>;

  // Refs exposed for detail view
  contentRef: React.RefObject<HTMLDivElement | null>;

  // Callbacks
  selectMeeting: (filename: string | null) => void;
  fetchList: () => Promise<void>;
  fetchDetail: (filename: string) => Promise<void>;
  fetchTagSummary: () => Promise<void>;
  projectParam: (extra?: string) => string;

  // Setters needed by children
  setError: (v: string | null) => void;
  setStatusFilter: (v: 'all' | 'in-progress' | 'complete') => void;
  setSearchQuery: (v: string) => void;
  setFocusedIndex: (v: number | null | ((prev: number | null) => number | null)) => void;
  setUserScrolledUp: (v: boolean) => void;
  setUserExplicitlyBack: (v: boolean) => void;
  setChatInput: (v: string) => void;
  setSending: (v: boolean) => void;
  setCopied: (v: 'summary' | 'all' | 'link' | 'digest' | null) => void;
  setLinkPreview: (v: boolean) => void;
  setOutcomesOpen: (v: boolean) => void;
  setAddingFacilitator: (v: boolean) => void;
  setFacilitatorError: (v: string | null) => void;
  setHasFacilitator: (v: boolean | null) => void;
  setQueuedRecs: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSuggestedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setDismissedSuggestions: React.Dispatch<React.SetStateAction<Set<string>>>;
  setQueuedSuggestions: React.Dispatch<React.SetStateAction<Set<string>>>;
  setViewRound: (v: number | null) => void;
  setShowContribDetails: (v: boolean) => void;
  setShowTerms: (v: boolean) => void;
  setMeetingTerms: (v: { word: string; count: number }[] | null) => void;
  setNotesOpen: (v: boolean) => void;
  setNoteText: (v: string) => void;
  setTagExpanded: (v: boolean) => void;
  setTagDetails: (v: MeetingData['tagDetails']) => void;
  setPlannedMeetings: React.Dispatch<React.SetStateAction<MeetingData['plannedMeetings']>>;
  setPollPaused: (v: boolean) => void;
  setConnectionLost: (v: boolean) => void;
  setShowPlanForm: (v: boolean) => void;
  setPlanTopic: (v: string) => void;
  setPlanType: (v: string) => void;
  setMeetingSearchOpen: (v: boolean) => void;
  setMeetingSearch: (v: string) => void;
  setMeetingSearchIndex: (v: number) => void;
  setMeetings: React.Dispatch<React.SetStateAction<MeetingListItem[]>>;

  // Derived
  filteredMeetings: MeetingListItem[];
  sortedMeetings: MeetingListItem[];
  tagCountsByMeeting: Record<string, { decisions: number; open: number; actions: number }>;
  hasMultipleProjects: boolean;

  // Callbacks for detail view
  togglePin: (filename: string) => void;
  deleteMeeting: (filename: string) => Promise<void>;
  bulkDeleteCompleted: () => Promise<void>;
  sendMessage: () => Promise<void>;
  scrollToBottom: () => void;
  handleScroll: () => void;
  handleNoteChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleNoteBlur: () => void;
  windowFind: (query: string, caseSensitive?: boolean, backward?: boolean) => boolean;
}

export function useMeetingData(activeProject: string | null, hasFacilitatorProp: boolean | null, setHasFacilitatorProp: (v: boolean | null) => void): MeetingData {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(searchParams.get('file'));
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagSummary, setTagSummary] = useState<MeetingData['tagSummary']>(null);
  const [taggedMeetings, setTaggedMeetings] = useState<Set<string>>(new Set());
  const [tagExpanded, setTagExpanded] = useState(false);
  const [tagDetails, setTagDetails] = useState<MeetingData['tagDetails']>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [userExplicitlyBack, setUserExplicitlyBack] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<'summary' | 'all' | 'link' | 'digest' | null>(null);
  const [linkPreview, setLinkPreview] = useState(false);
  const [outcomesOpen, setOutcomesOpen] = useState(false);
  const [addingFacilitator, setAddingFacilitator] = useState(false);
  const [facilitatorError, setFacilitatorError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'complete'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedRecs, setQueuedRecs] = useState<Set<number>>(new Set());
  const [suggestedExpanded, setSuggestedExpanded] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [queuedSuggestions, setQueuedSuggestions] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const [viewRound, setViewRound] = useState<number | null>(null);
  const [showContribDetails, setShowContribDetails] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [meetingTerms, setMeetingTerms] = useState<{ word: string; count: number }[] | null>(null);

  const [pinnedMeetings, setPinnedMeetings] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = localStorage.getItem('council-pinned-meetings');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const noteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [meetingSearchOpen, setMeetingSearchOpen] = useState(false);
  const [meetingSearch, setMeetingSearch] = useState('');
  const [meetingSearchIndex, setMeetingSearchIndex] = useState(0);
  const meetingSearchRef = useRef<HTMLInputElement>(null);

  const windowFind = useCallback((query: string, caseSensitive = false, backward = false) => {
    const win = window as unknown as { find?: (q: string, cs: boolean, bw: boolean) => boolean };
    return win.find?.(query, caseSensitive, backward) ?? false;
  }, []);

  const [seenContent, setSeenContent] = useState<string>('');
  const [latestEvent, setLatestEvent] = useState<string | null>(null);
  const [contextCards, setContextCards] = useState<{ id: string; context: string; source?: string; timestamp: string }[]>([]);

  const [plannedMeetings, setPlannedMeetings] = useState<{ id: string; type: string; topic: string; trigger?: string; source?: string }[]>([]);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planTopic, setPlanTopic] = useState('');
  const [planType, setPlanType] = useState('strategy');

  const [connectionLost, setConnectionLost] = useState(false);
  const [pollPaused, setPollPaused] = useState(false);
  const pollPausedRef = useRef(false);
  const failedPollsRef = useRef(0);

  const connectionLostRef = useRef(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const lastModifiedRef = useRef<string>('');
  const lastContentLengthRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const recentlyUpdatedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seenContentTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedRef = useRef<string | null>(searchParams.get('file'));
  const userExplicitlyBackRef = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Update both state and URL when selecting a meeting
  const selectMeeting = useCallback((filename: string | null) => {
    setSelected(filename);
    const params = new URLSearchParams(window.location.search);
    if (filename) {
      params.set('file', filename);
    } else {
      params.delete('file');
    }
    const newUrl = params.toString() ? `/meetings?${params}` : '/meetings';
    router.replace(newUrl, { scroll: false });
  }, [router]);

  // Keep refs in sync
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { userExplicitlyBackRef.current = userExplicitlyBack; }, [userExplicitlyBack]);
  useEffect(() => { userScrolledUpRef.current = userScrolledUp; }, [userScrolledUp]);
  useEffect(() => { connectionLostRef.current = connectionLost; }, [connectionLost]);
  useEffect(() => { pollPausedRef.current = pollPaused; }, [pollPaused]);

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

  // Fetch meeting list
  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings${projectParam()}`);
      if (!res.ok) { setFetchError(true); return; }
      const data = await res.json();
      setFetchError(false);
      setMeetings(Array.isArray(data) ? data : []);

      // Auto-select if exactly one is in-progress (but not if user explicitly went back)
      if (!selectedRef.current && !userExplicitlyBackRef.current) {
        const inProgress = data.filter((m: MeetingListItem) => m.status === 'in-progress');
        if (inProgress.length === 1) {
          selectMeeting(inProgress[0].filename);
        }
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [projectParam, selectMeeting]);

  // Fetch cross-meeting tag summary + build set of tagged meeting filenames + dismissed suggestions
  const fetchTagSummary = useCallback(async () => {
    try {
      const p = projectParam();
      const sep = p ? '&' : '?';
      const [summaryRes, searchRes, dismissedRes] = await Promise.all([
        fetch(`/api/meetings/tags${p}${sep}mode=summary`),
        fetch(`/api/meetings/tags${p}`),
        fetch(`/api/meetings/suggestions${p}`),
      ]);
      if (summaryRes.ok) setTagSummary(await summaryRes.json());
      if (searchRes.ok) {
        const data = await searchRes.json();
        const filenames = new Set<string>((data.results || []).map((r: { meeting: string }) => r.meeting as string));
        setTaggedMeetings(filenames);
      }
      if (dismissedRes.ok) {
        const data = await dismissedRes.json();
        setDismissedSuggestions(new Set(data.dismissed || []));
        setQueuedSuggestions(new Set(data.queued || []));
      }
    } catch {}
  }, [projectParam]);

  // Fetch single meeting content
  const fetchDetail = useCallback(async (filename: string) => {
    try {
      // Demo meeting: fetch from static file instead of API
      if (filename === '__demo__') {
        const res = await fetch('/demo-meeting.md');
        if (!res.ok) return;
        const content = await res.text();
        const get = (key: string) => {
          const m = content.match(new RegExp(`<!--\\s*${key}:\\s*(.+?)\\s*-->`));
          return m ? m[1].trim() : '';
        };
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const participants = get('participants').split(',').map(s => s.trim()).filter(Boolean);
        const data: MeetingDetail = {
          filename: '__demo__',
          date: get('created').slice(0, 10) || '2026-01-15',
          status: 'complete',
          type: get('meeting-type') || 'design-review',
          title: titleMatch ? titleMatch[1] : 'Example Meeting',
          started: null,
          participants,
          modifiedAt: new Date().toISOString(),
          content,
          preview: get('topic') || undefined,
        };
        setDetail(data);
        return;
      }

      const res = await fetch(`/api/meetings${projectParam(`file=${encodeURIComponent(filename)}`)}`);
      if (!res.ok) {
        failedPollsRef.current++;
        if (failedPollsRef.current >= 3) setConnectionLost(true);
        return;
      }
      const data: MeetingDetail = await res.json();

      // Poll succeeded -- reset failure tracking
      failedPollsRef.current = 0;
      if (connectionLostRef.current) setConnectionLost(false);

      // Only update if content changed
      if (data.modifiedAt !== lastModifiedRef.current) {
        lastModifiedRef.current = data.modifiedAt;

        // Track if content grew (new agent response)
        const newLength = data.content?.length ?? 0;
        if (newLength > lastContentLengthRef.current) {
          setRecentlyUpdated(true);
          if (recentlyUpdatedTimerRef.current) {
            clearTimeout(recentlyUpdatedTimerRef.current);
          }
          recentlyUpdatedTimerRef.current = setTimeout(() => setRecentlyUpdated(false), 3000);
        }
        lastContentLengthRef.current = newLength;

        setDetail(data);

        // After animation plays, mark all content as seen
        if (seenContentTimerRef.current) clearTimeout(seenContentTimerRef.current);
        seenContentTimerRef.current = setTimeout(() => {
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
      failedPollsRef.current++;
      if (failedPollsRef.current >= 3) setConnectionLost(true);
    }
  }, [projectParam]);

  // Initial list load + periodic refresh
  useEffect(() => {
    fetchList();
    fetchTagSummary();
    const interval = setInterval(fetchList, 5000);
    const tagInterval = setInterval(fetchTagSummary, 30000);
    return () => { clearInterval(interval); clearInterval(tagInterval); };
  }, [fetchList, fetchTagSummary]);

  // Fetch planned meetings
  useEffect(() => {
    const fetchPlanned = async () => {
      try {
        const res = await fetch('/api/council/planned');
        if (res.ok) {
          const data = await res.json();
          setPlannedMeetings(data.meetings || []);
        }
      } catch { /* silent */ }
    };
    fetchPlanned();
    const interval = setInterval(fetchPlanned, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll selected meeting
  useEffect(() => {
    if (!selected) return;

    lastModifiedRef.current = '';
    lastContentLengthRef.current = 0;
    setDetail(null);
    setSeenContent('');
    setUserScrolledUp(false);
    setQueuedRecs(new Set());
    setViewRound(null);
    setMeetingTerms(null);
    setShowTerms(false);
    setContextCards([]);
    fetchDetail(selected);

    // Don't poll static demo meeting
    if (selected !== '__demo__') {
      pollRef.current = setInterval(() => {
        if (!pollPausedRef.current) fetchDetail(selected);
      }, POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (recentlyUpdatedTimerRef.current) clearTimeout(recentlyUpdatedTimerRef.current);
      if (seenContentTimerRef.current) clearTimeout(seenContentTimerRef.current);
    };
  }, [selected, fetchDetail]);

  // Poll MCP events for live meetings
  useEffect(() => {
    if (!selected || !detail || detail.status !== 'in-progress') {
      setLatestEvent(null);
      return;
    }

    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/council/events?meeting=${encodeURIComponent(selected)}`);
        if (!res.ok) return;
        const data = await res.json();
        const events = data.events;
        if (events && events.length > 0) {
          const last = events[events.length - 1];
          switch (last.event) {
            case 'meeting_starting':
              setLatestEvent('Meeting starting...');
              break;
            case 'round_starting':
              setLatestEvent(`${last.detail || 'Next round'} starting...`);
              break;
            case 'agent_speaking':
              setLatestEvent(`${last.detail || 'Agent'} is thinking...`);
              break;
            case 'round_complete':
              setLatestEvent(`${last.detail || 'Round'} complete`);
              break;
            case 'meeting_complete':
              setLatestEvent('Meeting complete');
              break;
            default:
              setLatestEvent(null);
          }
        }
      } catch {
        // silent -- events are optional
      }
    };

    const fetchContext = async () => {
      try {
        const res = await fetch(`/api/council/context?meeting=${encodeURIComponent(selected)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.entries?.length > 0) {
            setContextCards(prev => {
              const existingIds = new Set(prev.map(c => c.id));
              const newEntries = data.entries.filter((e: { id: string }) => !existingIds.has(e.id));
              return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
            });
          }
        }
      } catch { /* silent */ }
    };

    fetchEvents();
    fetchContext();
    const interval = setInterval(() => { fetchEvents(); fetchContext(); }, 3000);
    return () => clearInterval(interval);
  }, [selected, detail?.status]);

  // Load notes from localStorage when selected meeting changes
  useEffect(() => {
    if (!selected) {
      setNoteText('');
      setNotesOpen(false);
      return;
    }
    try {
      const stored = localStorage.getItem(`council-notes-${selected}`);
      setNoteText(stored ?? '');
    } catch {
      setNoteText('');
    }
    return () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    };
  }, [selected]);

  // Save notes to localStorage (debounced)
  const saveNotes = useCallback((text: string, filename: string) => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      try {
        if (text.trim()) {
          localStorage.setItem(`council-notes-${filename}`, text);
        } else {
          localStorage.removeItem(`council-notes-${filename}`);
        }
      } catch { /* ignore storage errors */ }
    }, 1000);
  }, []);

  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setNoteText(text);
    if (selected) saveNotes(text, selected);
  }, [selected, saveNotes]);

  const handleNoteBlur = useCallback(() => {
    if (!selected) return;
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    try {
      if (noteText.trim()) {
        localStorage.setItem(`council-notes-${selected}`, noteText);
      } else {
        localStorage.removeItem(`council-notes-${selected}`);
      }
    } catch { /* ignore storage errors */ }
  }, [selected, noteText]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setUserScrolledUp(!nearBottom);
  }, []);

  // Filtered meetings list
  const filteredMeetings = useMemo(() =>
    meetings.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          (m.title?.toLowerCase().includes(q)) ||
          m.type.toLowerCase().includes(q) ||
          m.participants.some(p => p.toLowerCase().includes(q)) ||
          m.preview?.toLowerCase().includes(q) ||
          m.filename.toLowerCase().includes(q) ||
          m.date?.includes(q)
        );
      }
      return true;
    }),
    [meetings, statusFilter, searchQuery]
  );

  // Toggle pin on a meeting and persist to localStorage
  const togglePin = useCallback((filename: string) => {
    setPinnedMeetings(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      try {
        localStorage.setItem('council-pinned-meetings', JSON.stringify([...next]));
      } catch { /* ignore storage errors */ }
      return next;
    });
  }, []);

  // Sort filtered meetings: live first, then pinned, then the rest
  const sortedMeetings = useMemo(() => {
    return [...filteredMeetings].sort((a, b) => {
      const aLive = a.status === 'in-progress' ? 1 : 0;
      const bLive = b.status === 'in-progress' ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      const aPinned = pinnedMeetings.has(a.filename) ? 1 : 0;
      const bPinned = pinnedMeetings.has(b.filename) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0;
    });
  }, [filteredMeetings, pinnedMeetings]);

  // Build per-meeting tag counts from tagDetails for card badges
  const tagCountsByMeeting = useMemo(() => {
    if (!tagDetails) return {};
    const counts: Record<string, { decisions: number; open: number; actions: number }> = {};
    const inc = (filename: string, key: 'decisions' | 'open' | 'actions') => {
      if (!counts[filename]) counts[filename] = { decisions: 0, open: 0, actions: 0 };
      counts[filename][key]++;
    };
    for (const item of tagDetails.decisions) inc(item.meeting, 'decisions');
    for (const item of tagDetails.open) inc(item.meeting, 'open');
    for (const item of tagDetails.actions) inc(item.meeting, 'actions');
    return counts;
  }, [tagDetails]);

  // Reset focused index when the sorted list changes
  useEffect(() => {
    setFocusedIndex(prev => {
      if (prev === null) return null;
      if (sortedMeetings.length === 0) return null;
      if (prev >= sortedMeetings.length) return sortedMeetings.length - 1;
      return prev;
    });
  }, [sortedMeetings]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+F / Cmd+F -- open in-meeting search when viewing a detail
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && selected) {
        e.preventDefault();
        setMeetingSearchOpen(true);
        setMeetingSearch('');
        setMeetingSearchIndex(0);
        setTimeout(() => meetingSearchRef.current?.focus(), 0);
        return;
      }

      // Escape -- close search bar first, then go back to list
      if (e.key === 'Escape') {
        if (meetingSearchOpen) {
          setMeetingSearchOpen(false);
          setMeetingSearch('');
          return;
        }
      }

      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape' && selected) {
        selectMeeting(null);
        setUserExplicitlyBack(true);
      }
      // j/k to navigate meetings in list view, Enter to select
      if (!selected && sortedMeetings.length > 0) {
        if (e.key === 'j') {
          e.preventDefault();
          setFocusedIndex(prev =>
            prev === null ? 0 : (prev + 1) % sortedMeetings.length
          );
        } else if (e.key === 'k') {
          e.preventDefault();
          setFocusedIndex(prev =>
            prev === null ? sortedMeetings.length - 1 : (prev - 1 + sortedMeetings.length) % sortedMeetings.length
          );
        } else if (e.key === 'Enter' && focusedIndex !== null) {
          e.preventDefault();
          selectMeeting(sortedMeetings[focusedIndex].filename);
          setUserExplicitlyBack(false);
          setFocusedIndex(null);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selected, sortedMeetings, focusedIndex, selectMeeting, meetingSearchOpen]);

  const scrollToBottom = useCallback(() => {
    contentRef.current?.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
    setUserScrolledUp(false);
  }, []);

  const deleteMeeting = useCallback(async (filename: string) => {
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
  }, [projectParam]);

  const bulkDeleteCompleted = useCallback(async () => {
    const completed = meetings.filter(m => m.status === 'complete');
    if (completed.length === 0) return;
    if (!confirm(`Delete ${completed.length} completed meeting${completed.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      const filenames = completed.map(m => m.filename).join(',');
      const res = await fetch(`/api/meetings${projectParam(`files=${encodeURIComponent(filenames)}`)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete meetings');
        return;
      }
      const result = await res.json();
      const deletedSet = new Set(result.deleted || []);
      setMeetings(prev => prev.filter(m => !deletedSet.has(m.filename)));
      if (result.skipped?.length > 0) {
        setError(`Skipped ${result.skipped.length}: ${result.skipped.map((s: { filename: string; reason: string }) => s.filename).join(', ')}`);
      }
    } catch {
      setError('Failed to delete meetings');
    }
  }, [meetings, projectParam]);

  const sendMessage = useCallback(async () => {
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
  }, [chatInput, selected, sending, activeProject, fetchDetail]);

  // Check if meetings span multiple projects
  const hasMultipleProjects = useMemo(() => {
    const projects = new Set(meetings.map(m => m.project).filter(Boolean));
    return projects.size > 1;
  }, [meetings]);

  return {
    meetings,
    selected,
    detail,
    loading,
    fetchError,
    seenContent,
    recentlyUpdated,
    connectionLost,
    pollPaused,
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
    userScrolledUp,
    userExplicitlyBack,
    chatInput,
    sending,
    copied,
    linkPreview,
    outcomesOpen,
    addingFacilitator,
    facilitatorError,
    queuedRecs,
    suggestedExpanded,
    viewRound,
    showContribDetails,
    showTerms,
    meetingTerms,
    notesOpen,
    noteText,
    latestEvent,
    contextCards,
    showPlanForm,
    planTopic,
    planType,
    meetingSearchOpen,
    meetingSearch,
    meetingSearchIndex,
    meetingSearchRef,
    contentRef,
    selectMeeting,
    fetchList,
    fetchDetail,
    fetchTagSummary,
    projectParam,
    setError,
    setStatusFilter,
    setSearchQuery,
    setFocusedIndex,
    setUserScrolledUp,
    setUserExplicitlyBack,
    setChatInput,
    setSending,
    setCopied,
    setLinkPreview,
    setOutcomesOpen,
    setAddingFacilitator,
    setFacilitatorError,
    setHasFacilitator: setHasFacilitatorProp,
    setQueuedRecs,
    setSuggestedExpanded,
    setDismissedSuggestions,
    setQueuedSuggestions,
    setViewRound,
    setShowContribDetails,
    setShowTerms,
    setMeetingTerms,
    setNotesOpen,
    setNoteText,
    setTagExpanded,
    setTagDetails,
    setPlannedMeetings,
    setPollPaused,
    setConnectionLost,
    setShowPlanForm,
    setPlanTopic,
    setPlanType,
    setMeetingSearchOpen,
    setMeetingSearch,
    setMeetingSearchIndex,
    setMeetings,
    filteredMeetings,
    sortedMeetings,
    tagCountsByMeeting,
    hasMultipleProjects,
    togglePin,
    deleteMeeting,
    bulkDeleteCompleted,
    sendMessage,
    scrollToBottom,
    handleScroll,
    handleNoteChange,
    handleNoteBlur,
    windowFind,
  };
}
