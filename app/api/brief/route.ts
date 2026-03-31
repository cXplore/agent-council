import { NextResponse } from 'next/server';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { buildTagIndex, getUnresolved } from '@/lib/tag-index';

/**
 * GET /api/brief — Project brief for the home page.
 * Returns structured data about the current state of the active project.
 */
export async function GET() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);

    const [index, unresolved, meetingsRes] = await Promise.all([
      buildTagIndex(active.meetingsDir).catch(() => ({ decisions: [], actions: [], open: [], resolved: [], closed: [], ideas: [], meetingCount: 0 })),
      getUnresolved(active.meetingsDir).catch(() => ({ open: [], actions: [] })),
      fetch(`http://localhost:${config.port || 3003}/api/meetings`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);

    const meetings = Array.isArray(meetingsRes) ? meetingsRes : [];
    const liveMeetings = meetings.filter((m: { status: string }) => m.status === 'in-progress');
    const completedCount = meetings.filter((m: { status: string }) => m.status === 'complete').length;

    // Recent decisions (last 5)
    const recentDecisions = [...index.decisions]
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 5)
      .map(d => ({ text: d.text.split(' — ')[0].trim().slice(0, 100), date: d.date, meeting: d.meetingTitle }));

    // Active actions (top 3)
    const activeActions = unresolved.actions.slice(0, 3).map(a => ({
      text: a.text.replace(/\s*—\s*assigned to \w+.*$/, '').trim().slice(0, 100),
      date: a.date,
    }));

    // Open questions (top 2)
    const openQuestions = unresolved.open.slice(0, 2).map(o => ({
      text: o.text.slice(0, 100),
      slug: o.id,
    }));

    // Project info
    const profile = active.projectPath ? config.projects[active.name]?.profile : null;
    const languages = profile?.languages?.slice(0, 3).map((l: { name: string }) => l.name) ?? [];
    const frameworks = profile?.frameworks?.filter((f: { confidence: string }) => f.confidence === 'high').map((f: { name: string }) => f.name) ?? [];

    return NextResponse.json({
      project: active.name,
      stack: [...languages, ...frameworks].join(', ') || null,
      meetings: {
        total: meetings.length,
        live: liveMeetings.length,
        completed: completedCount,
      },
      decisions: {
        total: index.decisions.length,
        recent: recentDecisions,
      },
      actions: {
        active: activeActions.length,
        items: activeActions,
      },
      open: {
        count: unresolved.open.length,
        items: openQuestions,
      },
      focus: activeActions.length > 0
        ? activeActions[0].text
        : recentDecisions.length > 0
          ? recentDecisions[0].text
          : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
