import { NextRequest, NextResponse } from 'next/server';
import { loadTemplate, listTemplates, parseFrontmatter } from '@/lib/agent-templates';

/**
 * GET /api/setup/templates — list available agent templates with metadata.
 * Optional ?name= param to get a single template's full content.
 */
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get('name');

    if (name) {
      // Single template with full content
      try {
        const content = await loadTemplate(name);
        const { frontmatter, body } = parseFrontmatter(content);
        return NextResponse.json({
          name: frontmatter['name'] ?? name,
          description: frontmatter['description'] ?? '',
          model: frontmatter['model'] ?? '',
          role: frontmatter['role'] ?? 'member',
          required: frontmatter['required'] === 'true',
          // First 500 chars of body as preview
          preview: body.trim().slice(0, 500),
          fullLength: body.trim().length,
        });
      } catch {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
    }

    // List all templates with metadata
    const names = await listTemplates();
    const templates = await Promise.all(
      names.map(async (templateName) => {
        try {
          const content = await loadTemplate(templateName);
          const { frontmatter, body } = parseFrontmatter(content);
          return {
            template: templateName,
            name: frontmatter['name'] ?? templateName,
            description: frontmatter['description'] ?? '',
            model: frontmatter['model'] ?? '',
            role: frontmatter['role'] ?? 'member',
            required: frontmatter['required'] === 'true',
            contentLength: body.trim().length,
          };
        } catch {
          return {
            template: templateName,
            name: templateName,
            description: '',
            model: '',
            role: 'member',
            required: false,
            contentLength: 0,
          };
        }
      })
    );

    return NextResponse.json({ templates });
  } catch (err) {
    console.error('Templates API error:', err);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}
