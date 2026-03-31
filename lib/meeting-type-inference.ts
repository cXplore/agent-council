/**
 * Infer meeting type from a topic string using keyword matching.
 * Returns the best matching type, or the fallback if no keywords match.
 *
 * Rules are ordered by specificity — more specific types (retrospective,
 * incident-review) are checked before broader ones (strategy).
 */
export function inferMeetingType(topic: string, fallback = 'strategy'): string {
  const lower = topic.toLowerCase();

  const rules: [string[], string][] = [
    // retrospective — looking back at what happened
    [['retro', 'went wrong', 'went well', 'lessons learned', 'postmortem', 'post-mortem', 'look back', 'reflect on'], 'retrospective'],
    // incident-review — something broke
    [['incident', 'outage', 'downtime', 'failure', 'crash', 'p0', 'p1', 'sev1', 'sev0', 'root cause', 'broken'], 'incident-review'],
    // sprint-planning — organizing upcoming work
    [['sprint', 'next sprint', 'backlog', 'prioritize', 'prioritise', 'velocity', 'story points', 'plan the work', 'what to tackle'], 'sprint-planning'],
    // design-review — evaluating a design or component
    [['design review', 'review the design', 'review the api', 'review the code', 'component', 'mockup', 'wireframe', 'prototype', 'user flow'], 'design-review'],
    // architecture — system-level technical decisions
    [['architecture', 'system design', 'infra', 'scaling', 'database', 'schema', 'migration', 'monolith', 'microservice', 'tech stack', 'trade-off', 'tradeoff'], 'architecture'],
    // standup — daily sync
    [['standup', 'stand-up', 'daily sync', 'status update', 'check in', 'check-in', 'blockers', 'what are you working on'], 'standup'],
    // strategy — broad direction
    [['strategy', 'roadmap', 'vision', 'goals', 'okr', 'kpi', 'direction', 'pivot', 'big picture'], 'strategy'],
  ];

  for (const [keywords, meetingType] of rules) {
    if (keywords.some(kw => lower.includes(kw))) {
      return meetingType;
    }
  }

  return fallback;
}

/**
 * Infer the full meeting configuration from a topic string.
 * Returns type, agents, and rounds based on facilitator protocol:
 * - Direction check: 2 agents, 1 round
 * - Quick consult: 3 agents, 1 round
 * - Full meeting: 4 agents, 2 rounds (mandatory triad + specialist)
 */
export function inferMeetingConfig(topic: string): {
  type: string;
  agents: string[];
  rounds: number;
} {
  const type = inferMeetingType(topic);

  // Specialist agents chosen by meeting type
  const SPECIALISTS: Record<string, string[]> = {
    'design-review': ['designer'],
    'architecture': ['architect'],
    'sprint-planning': ['developer'],
    'incident-review': ['developer'],
    'retrospective': ['developer'],
    'standup': [],
    'strategy': [],
  };

  const specialists = SPECIALISTS[type] ?? [];
  const triad = ['project-manager', 'critic', 'north-star'];

  // Short topics (< 20 words, no question marks) → direction check (lean)
  const wordCount = topic.trim().split(/\s+/).length;
  const isQuestion = topic.includes('?');

  if (wordCount <= 8 && !isQuestion) {
    // Very short → direction check: 2 agents, 1 round
    return {
      type: 'direction-check',
      agents: ['project-manager', 'critic'],
      rounds: 1,
    };
  }

  if (type === 'standup') {
    return { type, agents: ['project-manager', 'critic'], rounds: 1 };
  }

  // Most meetings: triad + specialist, 2 rounds
  const agents = [...triad, ...specialists.filter(s => !triad.includes(s))];
  return {
    type,
    agents,
    rounds: 2,
  };
}
