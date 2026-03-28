import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { parseMetadata } from '@/lib/meeting-utils';

interface MeetingAnalytics {
  totalMeetings: number;
  completedMeetings: number;
  liveMeetings: number;
  meetingsByType: Record<string, number>;
  totalParticipants: string[];
  mostActiveAgents: { name: string; meetingCount: number }[];
  recentActivity: { last7Days: number; last30Days: number };
  averageParticipants: number;
}

export async function GET(request: NextRequest) {
  try {
    const config = await getConfig();
    const projectParam = request.nextUrl.searchParams.get('project');

    let meetingsDir: string;

    if (projectParam) {
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      meetingsDir = projectConfig.meetingsDir;
    } else {
      const active = getActiveProjectConfig(config);
      meetingsDir = active.meetingsDir;
    }

    // Read all meeting files
    let files: string[];
    try {
      files = await readdir(meetingsDir);
    } catch {
      // No meetings directory — return empty analytics
      const empty: MeetingAnalytics = {
        totalMeetings: 0,
        completedMeetings: 0,
        liveMeetings: 0,
        meetingsByType: {},
        totalParticipants: [],
        mostActiveAgents: [],
        recentActivity: { last7Days: 0, last30Days: 0 },
        averageParticipants: 0,
      };
      return NextResponse.json(empty, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    const mdFiles = files.filter(f => f.endsWith('.md'));

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let totalMeetings = 0;
    let completedMeetings = 0;
    let liveMeetings = 0;
    const meetingsByType: Record<string, number> = {};
    const agentCounts: Record<string, number> = {};
    const allParticipants = new Set<string>();
    let totalParticipantCount = 0;
    let last7Days = 0;
    let last30Days = 0;

    await Promise.all(
      mdFiles.map(async (f) => {
        try {
          const filePath = path.join(meetingsDir, f);
          const content = await readFile(filePath, 'utf-8');
          const fileStat = await stat(filePath);
          const metadata = parseMetadata(content);

          totalMeetings++;

          // Status counts
          if (metadata.status === 'complete') {
            completedMeetings++;
          } else if (metadata.status === 'in-progress') {
            liveMeetings++;
          }

          // Type counts
          meetingsByType[metadata.type] = (meetingsByType[metadata.type] ?? 0) + 1;

          // Participant tracking
          for (const p of metadata.participants) {
            allParticipants.add(p);
            agentCounts[p] = (agentCounts[p] ?? 0) + 1;
          }
          totalParticipantCount += metadata.participants.length;

          // Recent activity based on file modification time
          const mtime = fileStat.mtime.getTime();
          if (mtime >= sevenDaysAgo) last7Days++;
          if (mtime >= thirtyDaysAgo) last30Days++;
        } catch {
          // Skip unreadable files
        }
      })
    );

    // Sort agents by meeting count descending
    const mostActiveAgents = Object.entries(agentCounts)
      .map(([name, meetingCount]) => ({ name, meetingCount }))
      .sort((a, b) => b.meetingCount - a.meetingCount);

    const analytics: MeetingAnalytics = {
      totalMeetings,
      completedMeetings,
      liveMeetings,
      meetingsByType,
      totalParticipants: [...allParticipants].sort(),
      mostActiveAgents,
      recentActivity: { last7Days, last30Days },
      averageParticipants: totalMeetings > 0
        ? Math.round((totalParticipantCount / totalMeetings) * 10) / 10
        : 0,
    };

    return NextResponse.json(analytics, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}
