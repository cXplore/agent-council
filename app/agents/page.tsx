'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getAgentColor } from '@/lib/utils';
import { docComponents } from '@/lib/md-components';

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

function AgentCard({ agent, onSelect }: { agent: AgentInfo; onSelect: (a: AgentInfo) => void }) {
  return (
    <button
      onClick={() => onSelect(agent)}
      className="w-full text-left rounded-lg p-4 transition-colors hover:brightness-110"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
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
        <select
          className="text-xs rounded px-1 py-0.5 cursor-pointer"
          style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', outline: 'none' }}
          value={agent.model}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            e.stopPropagation();
            const newModel = e.target.value;
            try {
              const res = await fetch('/api/agents', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: agent.filename, field: 'model', value: newModel }),
              });
              if (res.ok) {
                setAgents(prev => prev.map(a => a.filename === agent.filename ? { ...a, model: newModel } : a));
              }
            } catch {}
          }}
        >
          <option value="opus">opus</option>
          <option value="sonnet">sonnet</option>
          <option value="haiku">haiku</option>
        </select>
      </div>
      <p className="text-xs mt-1 ml-5" style={{ color: 'var(--text-secondary)' }}>
        {agent.description}
      </p>
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
    </button>
  );
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [project, setProject] = useState<string>('');
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

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
  }, [searchParams]);

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
        <div className="max-w-3xl mx-auto px-6 py-8 w-full">
          <div className="flex items-center gap-3 mb-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: getAgentColor(selected.name) }}
            />
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
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
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {selected.model}
            </span>
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
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
          </div>
        )}
        {!project && !loading && (
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            No active project
          </p>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>
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
        ) : (() => {
          // Group by team if any agents have teams
          const hasTeams = agents.some(a => a.team);
          const groups: Record<string, AgentInfo[]> = {};
          if (hasTeams) {
            for (const agent of agents) {
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
            return (
              <div className="space-y-6">
                {teamOrder.map(team => (
                  <div key={team}>
                    <h2
                      className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {team} ({groups[team].length})
                    </h2>
                    <div className="space-y-2">
                      {groups[team].map(agent => (
                        <AgentCard key={agent.filename} agent={agent} onSelect={setSelected} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {agents.map(agent => (
                <AgentCard key={agent.filename} agent={agent} onSelect={setSelected} />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageInner />
    </Suspense>
  );
}
