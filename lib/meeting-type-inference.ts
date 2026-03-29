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
