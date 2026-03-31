import { NextRequest, NextResponse } from 'next/server';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { buildTagIndex, invalidateTagCache } from '@/lib/tag-index';

// Track resolved open questions
// Claude can mark questions resolved from any session via MCP
interface Resolution {
  id: string;
  slug: string;          // the OPEN:slug that was resolved
  resolution: string;    // how it was resolved
  meeting?: string;      // which meeting to append to (optional)
  timestamp: string;
}

const resolutions: Resolution[] = [];
const MAX_RESOLUTIONS = 50;

// Return all resolutions, with optional slug filter
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');

  let filtered = resolutions;
  if (slug) {
    filtered = filtered.filter(r => r.slug === slug);
  }

  return NextResponse.json({
    resolutions: filtered.map(r => ({
      id: r.id,
      slug: r.slug,
      resolution: r.resolution,
      meeting: r.meeting,
      timestamp: r.timestamp,
    })),
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// Add a new resolution
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, resolution, meeting } = body;

    if (!slug || !resolution) {
      return NextResponse.json({ error: 'slug and resolution are required' }, { status: 400 });
    }

    // Cap field lengths
    if (slug.length > 200 || resolution.length > 5000 || (meeting && meeting.length > 500)) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 });
    }

    const entry: Resolution = {
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      slug,
      resolution,
      meeting,
      timestamp: new Date().toISOString(),
    };

    resolutions.push(entry);

    // Keep only recent resolutions
    if (resolutions.length > MAX_RESOLUTIONS) {
      resolutions.splice(0, resolutions.length - MAX_RESOLUTIONS);
    }

    // Append the resolution to the meeting file so it persists across restarts
    let appended = false;
    let targetMeeting = meeting;
    try {
      const config = await getConfig();
      const active = getActiveProjectConfig(config);

      // If no meeting specified, find the meeting file containing the OPEN question
      if (!targetMeeting) {
        const index = await buildTagIndex(active.meetingsDir);
        const match = index.open.find(o =>
          (o.id && o.id === slug) || o.text.toLowerCase().includes(slug.toLowerCase())
        );
        if (match) targetMeeting = match.meeting;
      }

      if (targetMeeting) {
        const safeName = path.basename(targetMeeting);
        const filePath = path.join(active.meetingsDir, safeName);
        await appendFile(filePath, `\n[RESOLVED:${slug}] ${resolution}\n`, 'utf-8');
        appended = true;
        await invalidateTagCache(active.meetingsDir).catch(() => {});
      }
    } catch {
      // Non-critical — store in memory regardless
    }

    return NextResponse.json({ success: true, appended });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
