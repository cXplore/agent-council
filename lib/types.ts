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
  /** Detected libraries by category */
  libraries: Record<string, string[]>;
  suggestedPreset: string;
  suggestedAgents: string[];
  /** What agents can and cannot reason about — the production readiness gate */
  coverageBoundaries?: {
    /** Domains agents have visibility into (inferred from scan) */
    knownDomains: string[];
    /** Domains agents should hedge on (visible but not deeply understood) */
    unknownDomains: string[];
    /** Top-level dirs that were scanned */
    scannedPaths: string[];
    /** Top-level dirs that were skipped (node_modules, .git, etc.) */
    skippedPaths: string[];
    /** Total files scanned vs estimated total */
    filesCovered: number;
    filesEstimatedTotal: number;
  };
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
  /** Lightweight filesystem scan results — auto-populated on connect */
  profile?: ProjectProfile;
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

export interface SuggestedMeeting {
  text: string;
  type?: string;
  topic?: string;
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
  objective?: string | null;
  recommendedMeetings?: SuggestedMeeting[];
  wordCount?: number;
}

export interface MeetingDetail extends MeetingListItem {
  content: string;
}

/** Meeting event from the MCP bridge */
export interface MeetingEvent {
  event: string;
  meeting: string;
  detail?: string;
  timestamp: string;
}
