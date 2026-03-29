import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const MAX_LEARNING_LINES = 50;

interface ContextFileSections {
  header: string;
  learnings: string[];
  conventions: string;
  domain: string;
}

/**
 * Parse an agent context file into sections.
 * Expected format:
 *   # Agent — Context
 *   ## Meeting Learnings
 *   - [date] entry...
 *   ## Project Conventions
 *   ...
 *   ## Domain Knowledge
 *   ...
 */
function parseContextFile(content: string): ContextFileSections {
  const lines = content.split('\n');
  let section: 'header' | 'learnings' | 'conventions' | 'domain' = 'header';
  const header: string[] = [];
  const learnings: string[] = [];
  const conventions: string[] = [];
  const domain: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed.startsWith('## meeting learnings')) {
      section = 'learnings';
      continue;
    } else if (trimmed.startsWith('## project conventions')) {
      section = 'conventions';
      conventions.push(line);
      continue;
    } else if (trimmed.startsWith('## domain knowledge')) {
      section = 'domain';
      domain.push(line);
      continue;
    }

    switch (section) {
      case 'header': header.push(line); break;
      case 'learnings': learnings.push(line); break;
      case 'conventions': conventions.push(line); break;
      case 'domain': domain.push(line); break;
    }
  }

  // Filter learnings to actual content lines (non-empty, starts with -)
  const contentLearnings = learnings.filter(l => l.trim().startsWith('-'));

  return {
    header: header.join('\n'),
    learnings: contentLearnings,
    conventions: conventions.join('\n'),
    domain: domain.join('\n'),
  };
}

/**
 * Rebuild a context file from parsed sections.
 */
function buildContextFile(sections: ContextFileSections): string {
  const parts = [
    sections.header.trim(),
    '',
    '## Meeting Learnings',
    ...sections.learnings,
    '',
    sections.conventions.trim(),
    '',
    sections.domain.trim(),
    '',
  ];
  return parts.join('\n');
}

/**
 * Append new learning entries to a context file, enforcing a rolling window.
 * Keeps the most recent entries up to MAX_LEARNING_LINES.
 * Returns the updated content.
 */
export async function appendContextLearnings(
  filePath: string,
  newEntries: string[],
  maxLines: number = MAX_LEARNING_LINES
): Promise<string> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist — create with default structure
    const agentName = path.basename(filePath, '.context.md');
    content = `# ${agentName} — Context\n\n## Meeting Learnings\n\n## Project Conventions\n_Reserved for project-specific patterns._\n\n## Domain Knowledge\n_Reserved for domain-specific knowledge._\n`;
  }

  const sections = parseContextFile(content);

  // Add new entries
  sections.learnings.push(...newEntries.map(e => e.startsWith('- ') ? e : `- ${e}`));

  // Enforce rolling window — keep most recent entries
  if (sections.learnings.length > maxLines) {
    sections.learnings = sections.learnings.slice(-maxLines);
  }

  const updated = buildContextFile(sections);
  await writeFile(filePath, updated, 'utf-8');
  return updated;
}

/**
 * Trim an existing context file to the max learning lines.
 * Useful for one-time cleanup of files that have grown too large.
 * Returns the number of lines trimmed, or 0 if no trimming needed.
 */
export async function trimContextFile(
  filePath: string,
  maxLines: number = MAX_LEARNING_LINES
): Promise<number> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return 0;
  }

  const sections = parseContextFile(content);
  const originalCount = sections.learnings.length;

  if (originalCount <= maxLines) return 0;

  sections.learnings = sections.learnings.slice(-maxLines);
  const updated = buildContextFile(sections);
  await writeFile(filePath, updated, 'utf-8');

  return originalCount - maxLines;
}
