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
  /** Scan quality scoring — determines onboarding path (reveal vs generic) */
  scanQuality?: {
    quality: 'rich' | 'basic' | 'minimal';
    score: number;
    signals: string[];
    missingSignals: string[];
  };
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
  /** True if the 50,000-file cap was hit during scan — results are incomplete */
  truncated?: boolean;
  /** Project description extracted from README first paragraph or package.json description */
  projectDescription?: string;
  /** Test framework detection — name patterns and rough file count */
  testInfo?: {
    frameworks: string[];
    fileCount: number;
  };
  /** Primary entry point file (e.g., main server, app entry, CLI script) */
  entryPoint?: string;
  /** High-level synthesis of what was detected — gaps, notable signals, suggested first topic */
  synthesis?: {
    /** Notable framework/tool combinations */
    stackSignals: string[];
    /** Missing things you'd typically expect (e.g., no tests, no CI, no types) */
    gaps: string[];
    /** Auto-generated first meeting topic based on what was detected */
    suggestedFirstTopic: string | null;
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

/** Usage profile — controls token/cost trade-offs */
export type UsageProfile = 'lean' | 'standard' | 'deep';

export interface UsageSettings {
  /** Overall usage profile */
  profile: UsageProfile;
  /** Default rounds for meetings (overridable per-meeting) */
  defaultRounds: number;
  /** Max tokens per agent response */
  maxTokens: number;
  /** Default model override (uses agent frontmatter if not set) */
  defaultModel?: string;
  /** LLM backend preference — user explicitly chooses, no silent fallback */
  llmBackend?: 'auto' | 'oauth' | 'api-key';
}

/** Pre-defined usage profiles */
export const USAGE_PROFILES: Record<UsageProfile, Omit<UsageSettings, 'profile' | 'defaultModel'>> = {
  lean: { defaultRounds: 1, maxTokens: 2048 },
  standard: { defaultRounds: 2, maxTokens: 4096 },
  deep: { defaultRounds: 3, maxTokens: 8192 },
};

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
  /** Paths discovered by scanning nearby directories but not yet connected */
  discoveredPaths?: string[];
  /** Usage profile — controls token/cost trade-offs */
  usage?: UsageSettings;
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

/** Activity log entry — shared schema for worker, interactive, and meeting contexts */
export interface ActivityEntry {
  id: string;
  timestamp: string;
  source: 'worker' | 'interactive' | 'meeting';
  type: 'code_change' | 'meeting_complete' | 'action_resolved' | 'flag' | 'worker_run';
  summary: string;
  detail?: string;
  linkedMeeting?: string;
  linkedCommit?: string;
}
