import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'agents');
const PRESETS_DIR = path.join(process.cwd(), 'templates', 'presets');

// Load a single template by name (e.g., "developer")
export async function loadTemplate(name: string): Promise<string> {
  return readFile(path.join(TEMPLATES_DIR, `${name}.md`), 'utf-8');
}

// Load all available template names
export async function listTemplates(): Promise<string[]> {
  const files = await readdir(TEMPLATES_DIR);
  return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
}

// Load a preset by name
export async function loadPreset(name: string): Promise<{ name: string; description: string; agents: string[] }> {
  const raw = await readFile(path.join(PRESETS_DIR, `${name}.json`), 'utf-8');
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
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      const value = rest.join(':').trim();
      frontmatter[key.trim()] = value;
    }
  }
  return { frontmatter, body: match[2] };
}
