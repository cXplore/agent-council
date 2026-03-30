import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'agents');
// Load a single template by name (e.g., "developer")
export async function loadTemplate(name: string): Promise<string> {
  // Sanitize to prevent path traversal
  const safeName = path.basename(name);
  const filePath = path.join(TEMPLATES_DIR, `${safeName}.md`);
  // Verify resolved path stays within templates directory
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(TEMPLATES_DIR))) {
    throw new Error(`Invalid template name: ${name}`);
  }
  return readFile(resolved, 'utf-8');
}

// Load all available template names
export async function listTemplates(): Promise<string[]> {
  const files = await readdir(TEMPLATES_DIR);
  return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
}

// Fill placeholders in a template
export function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  // Replace any remaining unresolved placeholders with a sensible default
  result = result.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    return `[${key.toLowerCase().replace(/_/g, ' ')}]`;
  });
  return result;
}

// Parse frontmatter from agent markdown
export function parseFrontmatter(content: string): { frontmatter: Record<string, string | string[]>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, string | string[]> = {};
  const lines = match[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip YAML list items (handled by their parent key)
    if (line.startsWith('  - ') || line.startsWith('- ')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const inlineValue = line.substring(colonIndex + 1).trim();

    if (!key) continue;

    // Check if next lines are YAML list items
    const listItems: string[] = [];
    let j = i + 1;
    while (j < lines.length && (lines[j].startsWith('  - ') || lines[j].startsWith('- '))) {
      listItems.push(lines[j].replace(/^\s*-\s*/, '').trim());
      j++;
    }

    if (listItems.length > 0) {
      frontmatter[key] = listItems;
      i = j - 1; // skip consumed lines
    } else {
      frontmatter[key] = inlineValue;
    }
  }
  return { frontmatter, body: match[2] };
}

// Serialize frontmatter back to YAML string
export function serializeFrontmatter(frontmatter: Record<string, string | string[] | boolean>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else {
      const str = String(value);
      const needsQuoting = /[:#\[\]{}|>&*!@`]/.test(str) || str.startsWith(' ') || str.endsWith(' ');
      lines.push(`${key}: ${needsQuoting ? `"${str.replace(/"/g, '\\"')}"` : str}`);
    }
  }
  return lines.join('\n');
}
