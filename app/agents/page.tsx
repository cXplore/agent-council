'use client';

import { useState, useEffect } from 'react';

interface AgentInfo {
  filename: string;
  name: string;
  description: string;
  model: string;
  tools: string;
  content: string;
}

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 65%)`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectDir, setProjectDir] = useState('');

  const fetchAgents = async (dir?: string) => {
    setLoading(true);
    try {
      const url = dir ? `/api/agents?dir=${encodeURIComponent(dir)}` : '/api/agents';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Installed Agents
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Agent files from .claude/agents/ in your project.
        </p>

        {/* Project directory input */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchAgents(projectDir); }}
            placeholder="Project path (leave empty for current directory)"
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={() => fetchAgents(projectDir)}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Load
          </button>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : agents.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No agents found. <a href="/setup" className="underline" style={{ color: 'var(--accent)' }}>Set up a team</a> to get started.
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
                <p className="text-xs mt-1 ml-5.5" style={{ color: 'var(--text-secondary)' }}>
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
