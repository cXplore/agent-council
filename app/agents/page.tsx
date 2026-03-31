'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { motion } from 'motion/react';
import { getAgentColor } from '@/lib/utils';
import { docComponents } from '@/lib/md-components';
import { formatType } from '../meetings/MeetingListCard';
import type { MeetingListItem } from '@/lib/types';

interface AgentInfo {
  filename: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
  team: string;
  role: string;
  required: boolean;
  content: string;
}

interface AgentsResponse {
  agents: AgentInfo[];
  project: string;
}

function SuggestionBar({ agent }: { agent: AgentInfo }) {
  const [toast, setToast] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const suggest = async (type: string, message: string, field?: string, value?: string) => {
    try {
      const res = await fetch('/api/council/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, agent: agent.name, field, value, message }),
      });
      if (!res.ok) throw new Error('Server rejected suggestion');
      setToast('Suggestion sent — Claude will pick it up');
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast('Failed to send suggestion');
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Suggest:</span>
        {!agent.team && (
          <button
            onClick={() => suggest('move_team', `Assign ${agent.name} to a team`, 'team')}
            className="text-xs px-2 py-1 rounded transition-colors hover:brightness-125"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Assign team
          </button>
        )}
        {agent.role !== 'lead' && (
          <button
            onClick={() => suggest('set_role', `Make ${agent.name} a team lead`, 'role', 'lead')}
            className="text-xs px-2 py-1 rounded transition-colors hover:brightness-125"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Make lead
          </button>
        )}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs px-2 py-1 rounded transition-colors hover:brightness-125"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          Custom suggestion
        </button>
      </div>

      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customInput.trim()) {
                suggest('custom', customInput.trim());
                setCustomInput('');
                setShowCustom(false);
              }
            }}
            placeholder={`Suggest a change for ${agent.name}...`}
            className="flex-1 px-3 py-1.5 rounded text-xs outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            autoFocus
          />
          <button
            onClick={() => {
              if (customInput.trim()) {
                suggest('custom', customInput.trim());
                setCustomInput('');
                setShowCustom(false);
              }
            }}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Send
          </button>
        </div>
      )}

      {toast && (
        <div className="mt-2 text-xs px-3 py-1.5 rounded" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function MeetingHistory({ agentName, meetings }: { agentName: string; meetings: MeetingListItem[] }) {
  const participated = meetings.filter(m =>
    m.participants.some(p => p.toLowerCase() === agentName.toLowerCase())
  );

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
        Meeting history
        {participated.length > 0 && (
          <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: 'var(--text-muted)' }}>
            ({participated.length})
          </span>
        )}
      </h3>
      {participated.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No meetings found for this agent.
        </p>
      ) : (
        <div className="space-y-2">
          {participated.map(m => (
            <a
              key={m.filename}
              href={`/meetings?file=${encodeURIComponent(m.filename)}`}
              className="block rounded-lg px-4 py-3 transition-colors hover:brightness-110"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {m.title || m.filename}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '0.7rem' }}
                >
                  {formatType(m.type)}
                </span>
                {m.status === 'in-progress' && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)', fontSize: '0.7rem' }}
                  >
                    live
                  </span>
                )}
                <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {m.date || new Date(m.modifiedAt).toLocaleDateString()}
                </span>
              </div>
              {m.participants.length > 1 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {m.participants.filter(p => p.toLowerCase() !== agentName.toLowerCase()).slice(0, 5).map(p => (
                    <span key={p} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                      {p}
                    </span>
                  ))}
                  {m.participants.length - 1 > 5 && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                      +{m.participants.length - 1 - 5} more
                    </span>
                  )}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const TEAM_OPTIONS = ['core', 'engineering', 'design', 'security', 'content', 'domain', 'other'];
const MODEL_OPTIONS = ['opus', 'sonnet', 'haiku'];

function AgentCard({ agent, onSelect, editMode, teamOptions, onEditField }: {
  agent: AgentInfo;
  onSelect: (a: AgentInfo) => void;
  editMode?: boolean;
  teamOptions?: string[];
  onEditField?: (filename: string, field: string, value: string) => void;
}) {

  return (
    <div
      role={editMode ? undefined : 'button'}
      tabIndex={editMode ? undefined : 0}
      onClick={editMode ? undefined : () => onSelect(agent)}
      onKeyDown={editMode ? undefined : (e) => { if (e.key === 'Enter') onSelect(agent); }}
      draggable={editMode}
      onDragStart={editMode ? (e) => {
        e.dataTransfer.setData('agent-filename', agent.filename);
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
      } : undefined}
      onDragEnd={editMode ? (e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
      } : undefined}
      className={`w-full text-left rounded-xl p-4 card-hover ${editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: getAgentColor(agent.name) }}
        />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {agent.name}
        </span>
        {agent.role === 'lead' && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-muted)', color: 'var(--accent)', fontSize: '0.7rem' }}>
            lead
          </span>
        )}
        {agent.required && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)', fontSize: '0.7rem' }}>
            required
          </span>
        )}
        {!editMode && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {agent.model}
          </span>
        )}
      </div>
      <p className="text-xs mt-1 ml-5" style={{ color: 'var(--text-secondary)' }}>
        {agent.description}
      </p>
      {editMode && (
        <div className="flex items-center gap-2 mt-2 ml-5">
          <select
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            value={agent.team || ''}
            onChange={(e) => onEditField?.(agent.filename, 'team', e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">No team</option>
            {(teamOptions ?? TEAM_OPTIONS).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            value={agent.model || 'sonnet'}
            onChange={(e) => onEditField?.(agent.filename, 'model', e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            {MODEL_OPTIONS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}
      {agent.tools.length > 0 && (
        <div className="flex gap-1 mt-2 ml-5 flex-wrap">
          {agent.tools.slice(0, 5).map(t => (
            <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              {t}
            </span>
          ))}
          {agent.tools.length > 5 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              +{agent.tools.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function StatsBanner({ agents }: { agents: AgentInfo[] }) {
  const leads = agents.filter(a => a.role === 'lead').length;
  const members = agents.length - leads;

  const modelCounts: Record<string, number> = {};
  for (const a of agents) {
    const m = a.model || 'unknown';
    modelCounts[m] = (modelCounts[m] || 0) + 1;
  }

  const allTools = new Set<string>();
  for (const a of agents) {
    for (const t of a.tools) allTools.add(t);
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    backdropFilter: 'blur(12px) saturate(150%)',
    boxShadow: 'var(--shadow-sm)',
  };

  return (
    <motion.div
      className="flex gap-3 mb-6 flex-wrap"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Composition */}
      <div className="rounded-xl px-4 py-3 flex-1 min-w-[140px]" style={cardStyle}>
        <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Composition</div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{leads}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>lead{leads !== 1 ? 's' : ''}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{members}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>member{members !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Models */}
      <div className="rounded-xl px-4 py-3 flex-1 min-w-[140px]" style={cardStyle}>
        <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Models</div>
        <div className="flex items-baseline gap-3 flex-wrap">
          {Object.entries(modelCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([model, count]) => (
              <span key={model} className="flex items-baseline gap-1">
                <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{count}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{model}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Tools */}
      <div className="rounded-xl px-4 py-3 flex-1 min-w-[140px]" style={cardStyle}>
        <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Tool coverage</div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{allTools.size}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>unique tool{allTools.size !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {[...allTools].slice(0, 6).map(t => (
            <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
              {t}
            </span>
          ))}
          {allTools.size > 6 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
              +{allTools.size - 6}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface TemplateInfo {
  template: string;
  name: string;
  description: string;
  model: string;
  role: string;
  required: boolean;
  contentLength: number;
}

function CreateAgentForm({ onCreated }: { onCreated: () => void }) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [agentName, setAgentName] = useState('');
  const [model, setModel] = useState('sonnet');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/setup/templates');
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates ?? []);
          if (data.templates?.length > 0) {
            const first = data.templates[0];
            setSelectedTemplate(first.template);
            setAgentName(first.name);
            setModel(first.model || 'sonnet');
            setDescription(first.description);
          }
        }
      } catch {
        // Templates are required — show error inline
      } finally {
        setLoadingTemplates(false);
      }
    })();
  }, []);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tmpl = templates.find(t => t.template === templateId);
    if (tmpl) {
      setAgentName(tmpl.name);
      setModel(tmpl.model || 'sonnet');
      setDescription(tmpl.description);
    }
    setFeedback(null);
  };

  const handleSubmit = async () => {
    if (!selectedTemplate || !agentName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      // Get active project path
      const projRes = await fetch('/api/projects');
      if (!projRes.ok) throw new Error('Could not load project info');
      const projData = await projRes.json();
      const active = projData.activeProject;
      const proj = projData.projects?.find((p: { name: string }) => p.name === active);
      if (!proj?.path) throw new Error('No active project path found');

      const res = await fetch('/api/setup/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDir: proj.path,
          agents: [{
            name: agentName.trim(),
            template: selectedTemplate,
            model,
            description: description.trim() || undefined,
          }],
          projectProfile: {
            frameworks: [],
            languages: [],
            packageManager: 'npm',
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', message: result.error || 'Failed to create agent' });
        return;
      }

      if (result.errors?.length > 0 && (!result.created || result.created.length === 0)) {
        setFeedback({ type: 'error', message: result.errors[0].error });
        return;
      }

      const msg = result.created?.length > 0
        ? `Created ${agentName}`
        : 'Agent created';
      setFeedback({ type: 'success', message: result.errors?.length > 0 ? `${msg} (with warnings)` : msg });

      // Reset form
      setAgentName('');
      setDescription('');

      // Refresh agents list after a brief moment so the user sees the success message
      setTimeout(() => onCreated(), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setFeedback({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    outline: 'none',
  };

  return (
    <div
      className="rounded-lg p-5 mb-6"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
        Create new agent
      </h3>

      {loadingTemplates ? (
        <div className="loading-shimmer h-8 w-48 rounded" />
      ) : templates.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No templates available. Add templates to the templates/agents directory.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Template selector */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm"
              style={inputStyle}
            >
              {templates.map(t => (
                <option key={t.template} value={t.template}>{t.template}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Agent name</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => { setAgentName(e.target.value); setFeedback(null); }}
              placeholder="e.g. project-manager"
              className="w-full rounded px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="opus">opus</option>
              <option value="sonnet">sonnet</option>
              <option value="haiku">haiku</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setFeedback(null); }}
              placeholder="What does this agent do?"
              className="w-full rounded px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={submitting || !agentName.trim() || !selectedTemplate}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
              style={{
                background: 'var(--accent)',
                color: 'white',
                opacity: submitting || !agentName.trim() ? 0.5 : 1,
                cursor: submitting || !agentName.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create agent'}
            </button>

            {feedback && (
              <span
                className="text-xs px-3 py-1.5 rounded"
                style={{
                  background: feedback.type === 'success' ? 'var(--live-green-muted)' : 'var(--bg)',
                  color: feedback.type === 'success' ? 'var(--live-green)' : 'var(--error)',
                  border: feedback.type === 'error' ? '1px solid var(--error)' : undefined,
                }}
              >
                {feedback.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [project, setProject] = useState<string>('');
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [customTeams, setCustomTeams] = useState<string[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [dragOverTeam, setDragOverTeam] = useState<string | null>(null);
  // Buffered edits: filename -> { field: value } — applied on "Save", discarded on "Cancel"
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, string>>>({});

  const refreshAgents = () => setRefreshKey(k => k + 1);

  const handleEditField = (filename: string, field: string, value: string) => {
    setPendingEdits(prev => ({
      ...prev,
      [filename]: { ...prev[filename], [field]: value },
    }));
  };

  const saveEdits = async () => {
    for (const [filename, fields] of Object.entries(pendingEdits)) {
      for (const [field, value] of Object.entries(fields)) {
        try {
          await fetch('/api/agents', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, field, value }),
          });
        } catch { /* continue */ }
      }
    }
    setPendingEdits({});
    setEditMode(false);
    setCustomTeams([]);
    setNewTeamName('');
    refreshAgents();
  };

  const cancelEdits = () => {
    setPendingEdits({});
    setEditMode(false);
    setCustomTeams([]);
    setNewTeamName('');
  };

  // Apply pending edits to agents for display (so changes are visible before saving)
  const displayAgents = agents.map(agent => {
    const edits = pendingEdits[agent.filename];
    if (!edits) return agent;
    return { ...agent, ...edits };
  });

  const handleDropOnTeam = (team: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTeam(null);
    const filename = e.dataTransfer.getData('agent-filename');
    if (!filename) return;
    handleEditField(filename, 'team', team);
  };

  useEffect(() => { document.title = 'Agents — Agent Council'; }, []);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/agents');
        if (res.ok) {
          const data: AgentsResponse = await res.json();
          setAgents(data.agents);
          setProject(data.project);

          // Auto-select agent from URL param (e.g., ?agent=project-manager)
          const agentParam = searchParams.get('agent');
          if (agentParam) {
            const match = data.agents.find(a =>
              a.name === agentParam || a.filename === `${agentParam}.md`
            );
            if (match) setSelected(match);
          }
        } else {
          setFetchError(true);
        }
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, [searchParams, refreshKey]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/meetings');
        if (res.ok && !cancelled) {
          const data: MeetingListItem[] = await res.json();
          setMeetings(data);
        }
      } catch {
        // Meetings are supplementary — fail silently
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const filteredAgents = useMemo(() => {
    const source = displayAgents;
    if (!searchQuery) return source;
    const q = searchQuery.toLowerCase();
    return source.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.team.toLowerCase().includes(q) ||
      a.model.toLowerCase().includes(q)
    );
  }, [displayAgents, searchQuery]);

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <div
          className="sticky top-0 z-10 px-6 py-3 flex items-center gap-4"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setSelected(null)}
            className="text-sm hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            &larr; All agents
          </button>
        </div>
        <motion.div
          className="max-w-3xl mx-auto px-6 py-8 w-full"
          key={selected.filename}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: getAgentColor(selected.name) }}
            />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {selected.name}
            </h1>
            {selected.role === 'lead' && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                lead
              </span>
            )}
            {selected.required && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)' }}>
                required
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mb-6 ml-6">
            <select
              className="text-xs rounded px-1.5 py-0.5 cursor-pointer"
              style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', outline: 'none' }}
              value={selected.model}
              onChange={async (e) => {
                const newModel = e.target.value;
                try {
                  const res = await fetch('/api/agents', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: selected.filename, field: 'model', value: newModel }),
                  });
                  if (res.ok) {
                    setAgents(prev => prev.map(a => a.filename === selected.filename ? { ...a, model: newModel } : a));
                    setSelected(prev => prev ? { ...prev, model: newModel } : prev);
                  }
                } catch {}
              }}
            >
              <option value="opus">opus</option>
              <option value="sonnet">sonnet</option>
              <option value="haiku">haiku</option>
            </select>
            {selected.team && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {selected.team}
                </span>
              </>
            )}
            {selected.tools.length > 0 && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {selected.tools.length} tools
                </span>
              </>
            )}
          </div>

          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {selected.description}
          </p>

          {/* Suggestion actions */}
          <SuggestionBar agent={selected} />

          {/* Meeting history */}
          <MeetingHistory agentName={selected.name} meetings={meetings} />

          <div className="space-y-3">
            {(() => {
              // Split content into sections by ## headings for collapsible display
              const sections: { title: string; body: string }[] = [];
              const lines = selected.content.split('\n');
              let currentTitle = '';
              let currentBody: string[] = [];

              for (const line of lines) {
                if (line.startsWith('## ')) {
                  if (currentTitle || currentBody.length > 0) {
                    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
                  }
                  currentTitle = line.replace(/^##\s+/, '');
                  currentBody = [];
                } else {
                  currentBody.push(line);
                }
              }
              if (currentTitle || currentBody.length > 0) {
                sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
              }

              // If no sections (no ## headings), render as one block
              if (sections.length <= 1) {
                return (
                  <div
                    className="text-sm rounded-lg p-6 overflow-auto leading-relaxed prose prose-sm prose-invert max-w-none"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <ReactMarkdown components={docComponents}>{selected.content}</ReactMarkdown>
                  </div>
                );
              }

              return sections.map((section, i) => (
                <details
                  key={i}
                  open={i === 0}
                  className="rounded-lg overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <summary
                    className="px-6 py-4 cursor-pointer text-sm font-medium select-none hover:brightness-110"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {section.title || 'Overview'}
                  </summary>
                  <div
                    className="px-6 pb-6 text-sm leading-relaxed prose prose-sm prose-invert max-w-none"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <ReactMarkdown components={docComponents}>{section.body}</ReactMarkdown>
                  </div>
                </details>
              ));
            })()}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
          Agents
        </h1>
        {project && (
          <div className="flex items-center gap-3 mb-6">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {project} &middot; {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </p>
            {agents.length > 0 && (
              <a href="/setup" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Connect another project
              </a>
            )}
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="text-xs px-2.5 py-1 rounded transition-colors hover:brightness-125"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {showCreateForm ? 'Cancel' : '+ New Agent'}
            </button>
            {agents.length > 0 && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="text-xs px-2.5 py-1 rounded transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Edit
              </button>
            )}
            {editMode && (
              <>
                <button
                  onClick={cancelEdits}
                  className="text-xs px-2.5 py-1 rounded transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdits}
                  className="text-xs px-2.5 py-1 rounded transition-colors"
                  style={{
                    background: Object.keys(pendingEdits).length > 0 ? 'var(--accent)' : 'rgba(59, 130, 246, 0.15)',
                    color: Object.keys(pendingEdits).length > 0 ? 'white' : 'var(--accent)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  {Object.keys(pendingEdits).length > 0 ? `Save (${Object.keys(pendingEdits).length} changes)` : 'Save'}
                </button>
              </>
            )}
          </div>
        )}
        {!project && !loading && (
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            No active project
          </p>
        )}

        {showCreateForm && (
          <CreateAgentForm onCreated={() => { refreshAgents(); setShowCreateForm(false); }} />
        )}

        {!loading && !fetchError && agents.length > 0 && (
          <StatsBanner agents={agents} />
        )}

        {/* Edit mode toolbar */}
        {editMode && agents.length > 0 && (
          <div
            className="flex items-center gap-2 flex-wrap mb-4 px-4 py-3 rounded-lg"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)', borderStyle: 'dashed' }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Bulk actions:</span>
            <select
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              value=""
              onChange={(e) => {
                const newModel = e.target.value;
                if (!newModel) return;
                for (const agent of agents) {
                  handleEditField(agent.filename, 'model', newModel);
                }
              }}
            >
              <option value="">Set all models...</option>
              <option value="opus">All → opus</option>
              <option value="sonnet">All → sonnet</option>
              <option value="haiku">All → haiku</option>
            </select>
            <button
              onClick={async () => {
                const DEFAULT_TEAM_MAP: Record<string, string> = {
                  'facilitator': 'core', 'project-manager': 'core', 'critic': 'core', 'north-star': 'core',
                  'developer': 'engineering', 'architect': 'engineering', 'qa-engineer': 'engineering', 'devops': 'engineering',
                  'designer': 'design', 'security-reviewer': 'security', 'domain-expert': 'domain', 'tech-writer': 'content',
                };
                const applyTeams = (mapping: Record<string, string>) => {
                  for (const agent of agents) {
                    const team = mapping[agent.name] ?? mapping[agent.filename.replace('.md', '')] ?? 'other';
                    handleEditField(agent.filename, 'team', team);
                  }
                };
                try {
                  const res = await fetch('/api/agents/suggest-teams', { method: 'POST' });
                  if (!res.ok) {
                    applyTeams(DEFAULT_TEAM_MAP);
                    return;
                  }
                  const data = await res.json();
                  const teamAssignments = data.teams || {};
                  applyTeams(teamAssignments);
                  // Add any new teams from the AI suggestion
                  const aiTeams = [...new Set(Object.values(teamAssignments) as string[])];
                  for (const team of aiTeams) {
                    if (!TEAM_OPTIONS.includes(team) && !customTeams.includes(team)) {
                      setCustomTeams(prev => [...prev, team]);
                    }
                  }
                } catch {
                  applyTeams(DEFAULT_TEAM_MAP);
                }
              }}
              className="text-xs px-2.5 py-1 rounded"
              style={{ background: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid var(--border-glow)' }}
            >
              ✨ AI suggest teams
            </button>
            <span style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTeamName.trim()) {
                  const name = newTeamName.trim().toLowerCase().replace(/\s+/g, '-');
                  if (!customTeams.includes(name)) {
                    setCustomTeams(prev => [...prev, name]);
                  }
                  setNewTeamName('');
                }
              }}
              placeholder="New team name..."
              className="text-xs px-2 py-1 rounded outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: 130 }}
            />
            <button
              onClick={() => {
                if (newTeamName.trim()) {
                  const name = newTeamName.trim().toLowerCase().replace(/\s+/g, '-');
                  if (!customTeams.includes(name)) {
                    setCustomTeams(prev => [...prev, name]);
                  }
                  setNewTeamName('');
                }
              }}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              + Team
            </button>
          </div>
        )}

        {!loading && !fetchError && agents.length > 3 && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, description, team, or model..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="loading-shimmer w-2.5 h-2.5 rounded-full" />
                  <div className="loading-shimmer h-4 rounded" style={{ width: `${80 + i * 20}px` }} />
                </div>
                <div className="loading-shimmer h-3 w-48 rounded mt-2 ml-5" />
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div
            className="rounded-lg px-5 py-4 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--error)', color: 'var(--text-secondary)' }}
          >
            Could not load agents. Check that the project directory exists and try refreshing.
          </div>
        ) : agents.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              No agents found{project ? ` for ${project}` : ''}. Set up a team to start running meetings.
            </p>
            <div className="flex items-center justify-center gap-3">
              <a
                href="/setup"
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Set up agents
              </a>
              <a
                href="/guide"
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Learn more
              </a>
            </div>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div
            className="rounded-lg px-5 py-4 text-sm text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            No agents match &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (() => {
          // Group by team if any agents have teams OR custom teams exist in edit mode
          const hasTeams = filteredAgents.some(a => a.team) || (editMode && customTeams.length > 0);
          const groups: Record<string, AgentInfo[]> = {};
          if (hasTeams) {
            for (const agent of filteredAgents) {
              const team = agent.team || 'Other';
              if (!groups[team]) groups[team] = [];
              groups[team].push(agent);
            }
            // Sort teams: 'core' first, then alphabetical
            const teamOrder = Object.keys(groups).sort((a, b) => {
              if (a === 'core') return -1;
              if (b === 'core') return 1;
              if (a === 'Other') return 1;
              if (b === 'Other') return -1;
              return a.localeCompare(b);
            });
            // Sort agents within teams: leads first
            for (const team of teamOrder) {
              groups[team].sort((a, b) => {
                if (a.role === 'lead' && b.role !== 'lead') return -1;
                if (b.role === 'lead' && a.role !== 'lead') return 1;
                return a.name.localeCompare(b.name);
              });
            }
            let globalIndex = 0;
            return (
              <div className="space-y-6">
                {teamOrder.map(team => {
                  const teamAgents = groups[team];
                  const isDragOver = dragOverTeam === team;
                  return (
                    <div
                      key={team}
                      onDragOver={editMode ? (e) => { e.preventDefault(); setDragOverTeam(team); } : undefined}
                      onDragLeave={editMode ? () => setDragOverTeam(null) : undefined}
                      onDrop={editMode ? (e) => handleDropOnTeam(team, e) : undefined}
                      style={isDragOver ? { outline: '2px dashed var(--accent)', outlineOffset: 4, borderRadius: 8 } : undefined}
                    >
                      <h2
                        className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                        style={{ color: isDragOver ? 'var(--accent)' : 'var(--text-muted)' }}
                      >
                        {team} ({teamAgents.length})
                      </h2>
                      <div className="space-y-2">
                        {teamAgents.map(agent => {
                          const idx = globalIndex++;
                          return (
                            <motion.div
                              key={agent.filename}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, delay: idx < 10 ? idx * 0.04 : 0 }}
                            >
                              <AgentCard agent={agent} onSelect={setSelected} editMode={editMode} onEditField={handleEditField} teamOptions={[...new Set([...TEAM_OPTIONS, ...customTeams])]} />
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Empty custom teams — shown in edit mode as drop targets */}
                {editMode && customTeams
                  .filter(t => !teamOrder.includes(t))
                  .map(team => {
                    const isDragOver = dragOverTeam === team;
                    return (
                      <div
                        key={team}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTeam(team); }}
                        onDragLeave={() => setDragOverTeam(null)}
                        onDrop={(e) => handleDropOnTeam(team, e)}
                        style={isDragOver ? { outline: '2px dashed var(--accent)', outlineOffset: 4, borderRadius: 8 } : undefined}
                      >
                        <div className="flex items-center justify-between mb-2 px-1">
                          <h2
                            className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: isDragOver ? 'var(--accent)' : 'var(--text-muted)' }}
                          >
                            {team} (0)
                          </h2>
                          <button
                            onClick={() => setCustomTeams(prev => prev.filter(t => t !== team))}
                            className="text-xs px-1.5 py-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--text-muted)' }}
                            title="Remove empty team"
                          >
                            ✕
                          </button>
                        </div>
                        <div
                          className="rounded-lg px-4 py-6 text-center text-xs transition-colors"
                          style={{
                            border: isDragOver ? '2px dashed var(--accent)' : '1px dashed var(--border)',
                            color: isDragOver ? 'var(--accent)' : 'var(--text-muted)',
                            background: isDragOver ? 'rgba(59, 130, 246, 0.05)' : undefined,
                          }}
                        >
                          {isDragOver ? 'Drop here to assign' : 'Drag agents here or use the team dropdown'}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {filteredAgents.map((agent, i) => (
                <motion.div
                  key={agent.filename}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i < 10 ? i * 0.04 : 0 }}
                >
                  <AgentCard agent={agent} onSelect={setSelected} editMode={editMode} onEditField={handleEditField} teamOptions={[...new Set([...TEAM_OPTIONS, ...customTeams])]} />
                </motion.div>
              ))}
            </div>
          );
        })()}

        {/* Comparison table — only shown with 3+ agents */}
        {!loading && !fetchError && agents.length >= 3 && (() => {
          const sorted = [...agents].sort((a, b) => {
            const teamCmp = (a.team || 'zzz').localeCompare(b.team || 'zzz');
            if (teamCmp !== 0) return teamCmp;
            if (a.role === 'lead' && b.role !== 'lead') return -1;
            if (b.role === 'lead' && a.role !== 'lead') return 1;
            return a.name.localeCompare(b.name);
          });

          const cellStyle: React.CSSProperties = {
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
          };
          const headerStyle: React.CSSProperties = {
            ...cellStyle,
            color: 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          };

          return (
            <details className="mt-8 rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <summary
                className="px-5 py-3 cursor-pointer text-sm font-medium select-none hover:brightness-110"
                style={{ color: 'var(--text-primary)' }}
              >
                Compare agents ({agents.length})
              </summary>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ ...headerStyle, textAlign: 'left' }}>Agent Name</th>
                      <th style={{ ...headerStyle, textAlign: 'left' }}>Model</th>
                      <th style={{ ...headerStyle, textAlign: 'left' }}>Team</th>
                      <th style={{ ...headerStyle, textAlign: 'left' }}>Role</th>
                      <th style={{ ...headerStyle, textAlign: 'center' }}>Required</th>
                      <th style={{ ...headerStyle, textAlign: 'center' }}>Tools Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(agent => (
                      <tr key={agent.filename} className="hover:brightness-110" style={{ transition: 'filter 0.15s' }}>
                        <td style={cellStyle}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getAgentColor(agent.name) }} />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{agent.name}</span>
                          </span>
                        </td>
                        <td style={cellStyle}>{agent.model || '-'}</td>
                        <td style={cellStyle}>{agent.team || '-'}</td>
                        <td style={cellStyle}>
                          {agent.role === 'lead' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-muted)', color: 'var(--accent)', fontSize: '0.7rem' }}>lead</span>
                          ) : (
                            agent.role || 'member'
                          )}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>
                          {agent.required ? (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)', fontSize: '0.7rem' }}>yes</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{agent.tools.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })()}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64" style={{ color: 'var(--text-muted)' }}>Loading agents...</div>}>
      <AgentsPageInner />
    </Suspense>
  );
}
