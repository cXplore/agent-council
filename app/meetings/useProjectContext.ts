'use client';

import { useState, useEffect } from 'react';

export interface ProjectContext {
  activeProject: string | null;
  hasProject: boolean | null; // null = loading
  hasFacilitator: boolean | null; // null = still checking
}

export function useProjectContext(): ProjectContext {
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  const [hasFacilitator, setHasFacilitator] = useState<boolean | null>(null);

  useEffect(() => {
    async function fetchProjectState() {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const data = await res.json();
        const active = data.activeProject ?? null;
        setActiveProject(active);
        setHasProject(data.projects?.length > 0);

        // Check if active project has a facilitator
        if (active) {
          try {
            const agentsRes = await fetch('/api/agents');
            if (agentsRes.ok) {
              const agentsData = await agentsRes.json();
              const agents = agentsData.agents || [];
              setHasFacilitator(agents.some((a: { filename: string }) => a.filename === 'facilitator.md'));
            }
          } catch { /* silent */ }
        }
      } catch {
        // silent
      }
    }
    fetchProjectState();
  }, []);

  return { activeProject, hasProject, hasFacilitator };
}
