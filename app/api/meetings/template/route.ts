import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/meetings/template — generate a meeting file template.
 * Accepts query params: ?type=design-review&topic=API%20redesign&participants=pm,critic,dev
 * Returns the markdown content for a new meeting file.
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'strategy-session';
  const topic = request.nextUrl.searchParams.get('topic') || 'Untitled';
  const participants = request.nextUrl.searchParams.get('participants')?.split(',').map(p => p.trim()).filter(Boolean) || [];

  const formatType = type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16);

  const participantList = participants.length > 0
    ? participants.join(', ')
    : 'project-manager, critic, north-star';

  const template = `<!-- meeting-type: ${type} -->
<!-- status: in-progress -->
<!-- created: ${dateStr} ${timeStr} -->
<!-- participants: ${participantList} -->
<!-- topic: ${topic} -->

# ${formatType}: ${topic}

## Context
[Describe what prompted this meeting, relevant project state, and what decisions need to be made]

---

## Round 1 (Parallel — Independent Thinking)

[Agent responses will be appended here by the facilitator]
`;

  const filename = `${dateStr}-${type}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.md`;

  return NextResponse.json({
    filename,
    content: template,
    type,
    topic,
    participants: participantList.split(', '),
  });
}
