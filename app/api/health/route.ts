import { NextResponse } from 'next/server';
import { getConfig, validateProjects } from '@/lib/config';

/**
 * GET /api/health — Application health check.
 * Returns server status, project count, and basic diagnostics.
 * Useful for monitoring, Electron readiness checks, and MCP status.
 */
export async function GET() {
  try {
    const config = await getConfig();
    const { valid, missing } = await validateProjects(config);

    return NextResponse.json({
      status: 'ok',
      version: process.env.npm_package_version || '0.1.0',
      uptime: process.uptime(),
      activeProject: config.activeProject,
      projects: {
        total: Object.keys(config.projects).length,
        accessible: valid.length,
        missing: missing.length,
      },
      node: process.version,
      platform: process.platform,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
