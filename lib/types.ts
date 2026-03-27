export interface ProjectProfile {
  languages: { name: string; fileCount: number; percentage: number }[];
  frameworks: { name: string; confidence: 'high' | 'medium' | 'low'; version?: string }[];
  structure: {
    hasApi: boolean;
    hasFrontend: boolean;
    hasDatabase: boolean;
    hasTests: boolean;
    hasCICD: boolean;
    isMonorepo: boolean;
    hasDocker: boolean;
  };
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo' | 'go' | 'unknown';
  suggestedPreset: string;
  suggestedAgents: string[];
}

export interface AgentTemplate {
  name: string;
  description: string;
  model: string;
  tools: string[];
  content: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  tools: string[];
}

export interface Preset {
  name: string;
  description: string;
  agents: string[];
}

/** A connected project that agents can work on */
export interface ProjectConfig {
  path: string;
  meetingsDir: string;
  agentsDir: string;
}

/** Top-level council configuration */
export interface CouncilConfig {
  /** Connected projects keyed by name */
  projects: Record<string, ProjectConfig>;
  /** The currently active project name, or "workspace" */
  activeProject: string;
  /** Workspace mode — agents and meetings live in agent-council itself */
  workspace: {
    agentsDir: string;
    meetingsDir: string;
  };
  port: number;
}

export interface MeetingListItem {
  filename: string;
  date: string | null;
  status: string;
  type: string;
  title: string | null;
  started: string | null;
  participants: string[];
  modifiedAt: string;
  project?: string;
  preview?: string;
}

export interface MeetingDetail extends MeetingListItem {
  content: string;
  recommendedMeetings?: string[];
}
