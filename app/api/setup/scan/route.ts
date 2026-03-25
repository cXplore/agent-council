import { NextRequest, NextResponse } from 'next/server';
import { scanProject } from '@/lib/scanner';
import { stat } from 'node:fs/promises';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path: dirPath } = body;

    if (!dirPath || typeof dirPath !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "path" field' },
        { status: 400 },
      );
    }

    // Check directory exists before scanning
    try {
      const dirStat = await stat(dirPath);
      if (!dirStat.isDirectory()) {
        return NextResponse.json(
          { error: `Path is not a directory: ${dirPath}` },
          { status: 400 },
        );
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json(
          { error: `Directory not found: ${dirPath}` },
          { status: 404 },
        );
      }
      if (err.code === 'EACCES') {
        return NextResponse.json(
          { error: `Permission denied: ${dirPath}` },
          { status: 403 },
        );
      }
      throw err;
    }

    const profile = await scanProject(dirPath);
    return NextResponse.json(profile);
  } catch (err) {
    console.error('Scan error:', err);
    return NextResponse.json(
      { error: 'Failed to scan project' },
      { status: 500 },
    );
  }
}
