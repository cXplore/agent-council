'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAgentColor } from '@/lib/utils';
import { docComponents } from '@/lib/md-components';

interface AgentInfo {
  filename: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
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

          <div
            className="text-sm rounded-lg p-6 overflow-auto leading-relaxed prose prose-sm prose-invert max-w-none"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <ReactMarkdown components={docComponents}>
              {selected.content}
            </ReactMarkdown>
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
