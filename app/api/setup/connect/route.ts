import { NextRequest, NextResponse } from 'next/server';
import { connectProject } from '@/lib/connect-project';

export async function POST(req: NextRequest) {
  try {
    const { projectPath, meetingsDir, name } = await req.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'projectPath is required' }, { status: 400 });
    }

    // Strip quotes that users sometimes paste from terminal
    const cleanPath = projectPath.replace(/^["']|["']$/g, '');

    const result = await connectProject({
      projectPath: cleanPath,
      meetingsDir,
      name,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect project';
    const status = message.includes('not found') ? 404 : 400;
    console.error('Connect project error:', err);
    return NextResponse.json({ error: message }, { status });
  }
}
