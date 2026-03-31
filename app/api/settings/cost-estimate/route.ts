import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getUsageSettings } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';
import { estimateMeetingCost } from '@/lib/cost-estimate';

/**
 * POST /api/settings/cost-estimate
 *
 * Estimate the cost of running a meeting with given agents and rounds.
 * Returns a rough USD estimate based on published API pricing.
 *
 * Body: { agents: string[], rounds?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const agents: string[] = Array.isArray(body?.agents) ? body.agents : [];
    const config = await getConfig();
    const usageSettings = getUsageSettings(config);
    const rounds: number = typeof body?.rounds === 'number' ? body.rounds : (usageSettings.maxRounds ?? usageSettings.defaultRounds ?? 2);

    // Load model from each agent's frontmatter
    const active = getActiveProjectConfig(config);
    const agentModels: (string | undefined)[] = await Promise.all(
      agents.map(async (agentName) => {
        try {
          const filePath = path.join(active.agentsDir, `${agentName}.md`);
          const content = await readFile(filePath, 'utf-8');
          const { frontmatter } = parseFrontmatter(content);
          return (frontmatter['model'] as string) || undefined;
        } catch {
          return undefined;
        }
      }),
    );

    const estimate = estimateMeetingCost(agentModels, rounds, usageSettings.profile);

    return NextResponse.json(estimate);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
