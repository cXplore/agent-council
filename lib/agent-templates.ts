import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'agents');
const PRESETS_DIR = path.join(process.cwd(), 'templates', 'presets');

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

// Load a preset by name
export async function loadPreset(name: string): Promise<{ name: string; description: string; agents: string[] }> {
  const safeName = path.basename(name);
  const filePath = path.join(PRESETS_DIR, `${safeName}.json`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PRESETS_DIR))) {
    throw new Error(`Invalid preset name: ${name}`);
  }
  const raw = await readFile(resolved, 'utf-8');
  return JSON.parse(raw);
}

// List all presets
export async function listPresets(): Promise<string[]> {
  const files = await readdir(PRESETS_DIR);
  return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
}

// Fill placeholders in a template
export function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// Parse frontmatter from agent markdown
export function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, any> = {};
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
export function serializeFrontmatter(frontmatter: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}
