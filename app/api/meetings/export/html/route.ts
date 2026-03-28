import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { parseMetadata, titleFromFilename } from '@/lib/meeting-utils';

/**
 * GET /api/meetings/export/html?file=filename.md — export a single meeting as
 * a self-contained HTML page with inline CSS (dark theme).
 * Accepts optional ?project= param.
 */
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'file parameter is required' }, { status: 400 });
  }

  try {
    const config = await getConfig();
    const projectParam = request.nextUrl.searchParams.get('project');

    let meetingsDir: string;
    let projectName: string;

    if (projectParam) {
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      meetingsDir = projectConfig.meetingsDir;
      projectName = projectParam;
    } else {
      const active = getActiveProjectConfig(config);
      meetingsDir = active.meetingsDir;
      projectName = active.name;
    }

    const safeName = path.basename(filename);
    const filePath = path.join(meetingsDir, safeName);
    const content = await readFile(filePath, 'utf-8');
    const metadata = parseMetadata(content);
    const title = metadata.title || titleFromFilename(safeName);

    const html = buildHtml(content, title, projectName, metadata.participants);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName.replace(/\.md$/, '.html')}"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    console.error('HTML export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

/* ---------- Agent color assignment ---------- */

const AGENT_COLORS: string[] = [
  '#60a5fa', // blue
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#f87171', // red
  '#818cf8', // indigo
  '#e879f9', // fuchsia
];

function getAgentColor(agent: string, colorMap: Map<string, string>): string {
  const key = agent.toLowerCase();
  if (!colorMap.has(key)) {
    colorMap.set(key, AGENT_COLORS[colorMap.size % AGENT_COLORS.length]);
  }
  return colorMap.get(key)!;
}

/* ---------- Markdown to HTML (regex-based) ---------- */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function convertMarkdownToHtml(md: string, colorMap: Map<string, string>): string {
  // Strip HTML metadata comments
  let text = md.replace(/<!--[\s\S]*?-->/g, '');

  // Split into lines for block-level processing
  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push('<hr>');
      continue;
    }

    // Headings
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h3>${applyInline(escapeHtml(h3Match[1]), colorMap)}</h3>`);
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h2>${applyInline(escapeHtml(h2Match[1]), colorMap)}</h2>`);
      continue;
    }
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h1>${applyInline(escapeHtml(h1Match[1]), colorMap)}</h1>`);
      continue;
    }

    // List items
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) { htmlParts.push('<ul>'); inList = true; }
      htmlParts.push(`<li>${applyInline(escapeHtml(listMatch[1]), colorMap)}</li>`);
      continue;
    }

    // Numbered list items
    const numListMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numListMatch) {
      if (!inList) { htmlParts.push('<ul>'); inList = true; }
      htmlParts.push(`<li>${applyInline(escapeHtml(numListMatch[1]), colorMap)}</li>`);
      continue;
    }

    // Close list if we leave list context
    if (inList) { htmlParts.push('</ul>'); inList = false; }

    // Empty line — skip (paragraph breaks handled by grouping)
    if (line.trim() === '') {
      htmlParts.push('');
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p>${applyInline(escapeHtml(line), colorMap)}</p>`);
  }

  if (inList) htmlParts.push('</ul>');

  return htmlParts.join('\n');
}

/** Apply inline formatting: bold, italic, agent names, tags */
function applyInline(text: string, colorMap: Map<string, string>): string {
  // Bold agent names: **agent-name:** — color them
  text = text.replace(
    /\*\*([\w][\w-]*):\*\*/g,
    (_match, name) => {
      const lower = name.toLowerCase();
      const SKIP = ['type', 'date', 'participants', 'facilitator', 'status', 'context', 'topic'];
      if (SKIP.includes(lower)) {
        return `<strong>${name}:</strong>`;
      }
      const color = getAgentColor(name, colorMap);
      return `<strong style="color:${color}">${name}:</strong>`;
    }
  );

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Tags: [DECISION], [DECISION:owner], [OPEN], [OPEN:topic], [ACTION], [ACTION:owner]
  text = text.replace(
    /\[DECISION(?::[\w-]*)?\]/gi,
    (match) => `<span class="tag tag-decision">${match}</span>`
  );
  text = text.replace(
    /\[OPEN(?::[\w-]*)?\]/gi,
    (match) => `<span class="tag tag-open">${match}</span>`
  );
  text = text.replace(
    /\[ACTION(?::[\w-]*)?\]/gi,
    (match) => `<span class="tag tag-action">${match}</span>`
  );

  return text;
}

/* ---------- Build the full HTML document ---------- */

function buildHtml(
  markdown: string,
  title: string,
  project: string,
  participants: string[],
): string {
  const colorMap = new Map<string, string>();

  // Pre-populate color map from participants so colors are consistent
  for (const p of participants) {
    getAgentColor(p, colorMap);
  }

  const body = convertMarkdownToHtml(markdown, colorMap);

  // Build a legend for agent colors
  const legendItems = [...colorMap.entries()]
    .map(([name, color]) => `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(name)}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - Agent Council</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    line-height: 1.7;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .header {
    border-bottom: 1px solid #334155;
    padding-bottom: 1rem;
    margin-bottom: 2rem;
  }
  .header .project {
    font-size: 0.85rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  h1 { font-size: 1.75rem; color: #f8fafc; margin-bottom: 0.5rem; }
  h2 { font-size: 1.35rem; color: #f1f5f9; margin-top: 2rem; margin-bottom: 0.75rem; border-bottom: 1px solid #1e293b; padding-bottom: 0.4rem; }
  h3 { font-size: 1.1rem; color: #cbd5e1; margin-top: 1.25rem; margin-bottom: 0.5rem; }

  p { margin-bottom: 0.75rem; }

  ul { padding-left: 1.5rem; margin-bottom: 0.75rem; }
  li { margin-bottom: 0.3rem; }

  hr { border: none; border-top: 1px solid #334155; margin: 1.5rem 0; }

  strong { color: #f1f5f9; }
  em { color: #94a3b8; font-style: italic; }

  code {
    background: #1e293b;
    color: #e2e8f0;
    padding: 0.15rem 0.35rem;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: "Fira Code", "Consolas", monospace;
  }

  .tag {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tag-decision { background: #166534; color: #bbf7d0; }
  .tag-open    { background: #92400e; color: #fde68a; }
  .tag-action  { background: #1e40af; color: #bfdbfe; }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    font-size: 0.85rem;
    color: #94a3b8;
  }
  .legend-item { display: flex; align-items: center; gap: 0.35rem; }
  .legend-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  .footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid #334155;
    font-size: 0.8rem;
    color: #64748b;
    text-align: center;
  }

  @media print {
    body { background: #fff; color: #1e293b; padding: 1rem; }
    h1, h2, h3, strong { color: #0f172a; }
    em { color: #475569; }
    .tag-decision { background: #dcfce7; color: #166534; }
    .tag-open    { background: #fef3c7; color: #92400e; }
    .tag-action  { background: #dbeafe; color: #1e40af; }
    code { background: #f1f5f9; color: #1e293b; }
    hr, h2 { border-color: #cbd5e1; }
    .legend-dot { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="project">${escapeHtml(project)}</div>
    <h1>${escapeHtml(title)}</h1>
    ${legendItems ? `<div class="legend">${legendItems}</div>` : ''}
  </div>

  ${body}

  <div class="footer">
    Exported from Agent Council
  </div>
</body>
</html>`;
}
