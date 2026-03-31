import { NextResponse } from 'next/server';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { buildTagIndex, getUnresolved } from '@/lib/tag-index';
import { isLLMAvailable, detectBackend } from '@/lib/llm-query';
import { readdir } from 'node:fs/promises';

type CheckStatus = 'good' | 'warn' | 'bad';
interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
}

/**
 * GET /api/health-check — Project health report.
 * Aggregates multiple signals into a simple pass/warn/fail per category.
 */
export async function GET() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const checks: Check[] = [];

    // 1. LLM backend
    const llmAvailable = isLLMAvailable();
    const backend = detectBackend();
    checks.push({
      label: 'AI Backend',
      status: llmAvailable ? 'good' : 'bad',
      detail: llmAvailable ? `Connected (${backend})` : 'No API key or OAuth token configured',
    });

    // 2. Agent roster
    let agentCount = 0;
    let hasFacilitator = false;
    try {
      const entries = await readdir(active.agentsDir);
      const agentFiles = entries.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
      agentCount = agentFiles.length;
      hasFacilitator = agentFiles.includes('facilitator.md');
    } catch { /* dir not found */ }

    checks.push({
      label: 'Agent Team',
      status: agentCount >= 4 && hasFacilitator ? 'good' : agentCount > 0 ? 'warn' : 'bad',
      detail: agentCount === 0
        ? 'No agents configured'
        : `${agentCount} agents${hasFacilitator ? '' : ' (no facilitator)'}`,
    });

    // 3. Meeting activity
    let meetingCount = 0;
    let recentMeetings = 0;
    try {
      const meetings = await fetch(`http://localhost:${config.port || 3003}/api/meetings`).then(r => r.ok ? r.json() : []);
      const list = Array.isArray(meetings) ? meetings : [];
      meetingCount = list.length;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      recentMeetings = list.filter((m: { modifiedAt?: string }) => m.modifiedAt && m.modifiedAt > weekAgo).length;
    } catch { /* ignore */ }

    checks.push({
      label: 'Meetings',
      status: meetingCount > 0 ? 'good' : 'warn',
      detail: meetingCount === 0
        ? 'No meetings yet'
        : `${meetingCount} total, ${recentMeetings} this week`,
    });

    // 4. Decision health
    let decisionCount = 0;
    let activeActionCount = 0;
    let openQuestionCount = 0;
    let staleActionCount = 0;
    try {
      const [index, unresolved] = await Promise.all([
        buildTagIndex(active.meetingsDir),
        getUnresolved(active.meetingsDir),
      ]);
      decisionCount = index.decisions.length;
      activeActionCount = unresolved.actions.length;
      openQuestionCount = unresolved.open.length;

      // Count stale actions (>5 days old)
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      staleActionCount = unresolved.actions.filter(
        (a: { date?: string | null }) => a.date && new Date(a.date) < fiveDaysAgo
      ).length;
    } catch { /* ignore */ }

    checks.push({
      label: 'Decisions',
      status: decisionCount > 0 ? 'good' : 'warn',
      detail: decisionCount === 0
        ? 'No decisions tracked yet'
        : `${decisionCount} decisions, ${activeActionCount} active actions`,
    });

    checks.push({
      label: 'Action Backlog',
      status: staleActionCount === 0 ? 'good' : staleActionCount <= 5 ? 'warn' : 'bad',
      detail: activeActionCount === 0
        ? 'No active actions'
        : staleActionCount > 0
          ? `${staleActionCount} of ${activeActionCount} actions are stale (>5 days)`
          : `${activeActionCount} active, none stale`,
    });

    checks.push({
      label: 'Open Questions',
      status: openQuestionCount <= 5 ? 'good' : openQuestionCount <= 15 ? 'warn' : 'bad',
      detail: openQuestionCount === 0
        ? 'All questions resolved'
        : `${openQuestionCount} unresolved`,
    });

    // Overall score
    const badCount = checks.filter(c => c.status === 'bad').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;
    const overall: CheckStatus = badCount > 0 ? 'bad' : warnCount > 2 ? 'warn' : 'good';

    return NextResponse.json({ checks, overall });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
