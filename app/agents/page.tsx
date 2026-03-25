'use client';

import { useState, useEffect } from 'react';
import { getAgentColor } from '@/lib/utils';

interface AgentInfo {
  filename: string;
  name: string;
  description: string;
  model: string;
  tools: string;
  content: string;
}

interface AgentsResponse {
  agents: AgentInfo[];
  project: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [project, setProject] = useState<string>('');
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/agents');
        if (res.ok) {
          const data: AgentsResponse = await res.json();
          setAgents(data.agents);
          setProject(data.project);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  if (selected) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <button
            onClick={() => setSelected(null)}
            className="text-sm hover:underline mb-6"
            style={{ color: 'var(--accent)' }}
          >
            &larr; All agents
          </button>

          <div className="flex items-center gap-3 mb-6">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: getAgentColor(selected.name) }}
            />
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {selected.name}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              {selected.model}
            </span>
          </div>

          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            {selected.description}
          </p>

          <pre
            className="text-sm rounded-lg p-6 overflow-auto whitespace-pre-wrap leading-relaxed"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {selected.content}
          </pre>
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
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            {project} &middot; {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </p>
        )}
        {!project && !loading && (
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            No active project
          </p>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : agents.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No agents found for {project || 'this project'}. Connect a project with agents or{' '}
              <a href="/setup" className="underline" style={{ color: 'var(--accent)' }}>set up a new team</a>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map(agent => (
              <button
                key={agent.filename}
                onClick={() => setSelected(agent)}
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
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {agent.model}
                  </span>
                </div>
                <p className="text-xs mt-1 ml-5" style={{ color: 'var(--text-secondary)' }}>
                  {agent.description}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
