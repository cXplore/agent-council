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

export interface CouncilConfig {
  projectDir: string;
  meetingsDir: string;
  agentsDir: string;
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
}

export interface MeetingDetail extends MeetingListItem {
  content: string;
}
