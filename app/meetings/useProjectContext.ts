'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export interface ProjectContext {
  activeProject: string | null;
  hasProject: boolean | null; // null = loading
  hasFacilitator: boolean | null; // null = still checking
}

export function useProjectContext(): ProjectContext {
  const searchParams = useSearchParams();
  const urlProject = searchParams.get('project');

  const [serverProject, setServerProject] = useState<string | null>(null);
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  const [hasFacilitator, setHasFacilitator] = useState<boolean | null>(null);

  // URL param takes precedence over server state (matches Nav behavior)
  const activeProject = urlProject || serverProject;

  useEffect(() => {
    async function fetchProjectState() {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const data = await res.json();
        setServerProject(data.activeProject ?? null);
        setHasProject(data.projects?.length > 0);

        // Check if active project has a facilitator
        const active = urlProject || data.activeProject;
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
  }, [urlProject]);

  return { activeProject, hasProject, hasFacilitator };
}
