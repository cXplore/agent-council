import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectProfile } from './types';

export const MAX_LEARNING_LINES = 50;
const STALE_DAYS = 30;

interface ContextFileSections {
  header: string;
  learnings: string[];
  corrections: string[];
  conventions: string;
  domain: string;
}

export interface ContextHealth {
  agent: string;
  totalLearnings: number;
  totalCorrections: number;
  oldestEntryDate: string | null;
  newestEntryDate: string | null;
  staleEntries: number;
  staleDays: number;
  capacityUsed: number; // percentage of MAX_LEARNING_LINES
}

/**
 * Parse a date string from a learning entry like "- [2026-03-01 strategy] ..."
 * Returns null if no date found.
 */
export function parseLearningDate(entry: string): Date | null {
  const match = entry.match(/\[(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  // Use noon UTC to avoid timezone-related date shifts
  const d = new Date(match[1] + 'T12:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse an agent context file into sections.
 * Expected format:
 *   # Agent — Context
 *   ## Meeting Learnings
 *   - [date] entry...
 *   ## Corrections
 *   - [date] [CORRECTION] ...
 *   ## Project Conventions
 *   ...
 *   ## Domain Knowledge
 *   ...
 */
function parseContextFile(content: string): ContextFileSections {
  const lines = content.split('\n');
  let section: 'header' | 'learnings' | 'corrections' | 'conventions' | 'domain' = 'header';
  const header: string[] = [];
  const learnings: string[] = [];
  const corrections: string[] = [];
  const conventions: string[] = [];
  const domain: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed.startsWith('## meeting learnings')) {
      section = 'learnings';
      continue;
    } else if (trimmed.startsWith('## corrections')) {
      section = 'corrections';
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
      case 'corrections': corrections.push(line); break;
      case 'conventions': conventions.push(line); break;
      case 'domain': domain.push(line); break;
    }
  }

  // Filter to actual content lines (non-empty, starts with -)
  const contentLearnings = learnings.filter(l => l.trim().startsWith('-'));
  const contentCorrections = corrections.filter(l => l.trim().startsWith('-'));

  return {
    header: header.join('\n'),
    learnings: contentLearnings,
    corrections: contentCorrections,
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
  ];

  // Only include Corrections section if there are entries
  if (sections.corrections.length > 0) {
    parts.push('## Corrections');
    parts.push(...sections.corrections);
    parts.push('');
  }

  parts.push(
    sections.conventions.trim(),
    '',
    sections.domain.trim(),
    '',
  );
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
 * Append a correction record. Corrections are stored in a separate section
 * and are NOT subject to the rolling window — they persist until manually removed.
 * Max 20 corrections; oldest trimmed if exceeded.
 *
 * Format: - [date] [CORRECTION] In [meeting], claimed X. Actual: Y. Update: Z.
 */
export async function appendCorrection(
  filePath: string,
  correction: string,
  maxCorrections: number = 20
): Promise<string> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    const agentName = path.basename(filePath, '.context.md');
    content = `# ${agentName} — Context\n\n## Meeting Learnings\n\n## Project Conventions\n_Reserved for project-specific patterns._\n\n## Domain Knowledge\n_Reserved for domain-specific knowledge._\n`;
  }

  const sections = parseContextFile(content);

  const entry = correction.startsWith('- ') ? correction : `- ${correction}`;
  sections.corrections.push(entry);

  // Cap corrections at maxCorrections
  if (sections.corrections.length > maxCorrections) {
    sections.corrections = sections.corrections.slice(-maxCorrections);
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

/**
 * Analyze the health of a context file — staleness, capacity, date range.
 */
export async function getContextHealth(
  filePath: string,
  now: Date = new Date()
): Promise<ContextHealth> {
  const agentName = path.basename(filePath, '.context.md');

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return {
      agent: agentName,
      totalLearnings: 0,
      totalCorrections: 0,
      oldestEntryDate: null,
      newestEntryDate: null,
      staleEntries: 0,
      staleDays: STALE_DAYS,
      capacityUsed: 0,
    };
  }

  const sections = parseContextFile(content);

  const dates = sections.learnings
    .map(parseLearningDate)
    .filter((d): d is Date => d !== null);

  const staleThreshold = new Date(now);
  staleThreshold.setDate(staleThreshold.getDate() - STALE_DAYS);

  const staleEntries = dates.filter(d => d < staleThreshold).length;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const oldest = sorted[0] ?? null;
  const newest = sorted[sorted.length - 1] ?? null;

  return {
    agent: agentName,
    totalLearnings: sections.learnings.length,
    totalCorrections: sections.corrections.length,
    oldestEntryDate: oldest ? oldest.toISOString().split('T')[0] : null,
    newestEntryDate: newest ? newest.toISOString().split('T')[0] : null,
    staleEntries,
    staleDays: STALE_DAYS,
    capacityUsed: Math.round((sections.learnings.length / MAX_LEARNING_LINES) * 100),
  };
}

/**
 * Generate a skeleton agent context file from a project scan profile.
 * Written once at project connect time so agents immediately know
 * the project's tech stack and structure.
 */
export function generateSkeletonContext(agentName: string, profile: ProjectProfile): string {
  const lines: string[] = [];

  lines.push(`# ${agentName} — Context`);
  lines.push('');

  // Domain knowledge section — the scanner output as project awareness
  lines.push('## Domain Knowledge');
  lines.push('');

  // Tech stack
  const langs = profile.languages.filter(l => l.percentage >= 5).map(l => l.name);
  if (langs.length > 0) {
    lines.push(`**Languages:** ${langs.join(', ')}`);
  }

  const fws = profile.frameworks.filter(f => f.confidence !== 'low');
  if (fws.length > 0) {
    const fwStrs = fws.map(f => f.version ? `${f.name} ${f.version}` : f.name);
    lines.push(`**Frameworks:** ${fwStrs.join(', ')}`);
  }

  if (profile.packageManager !== 'unknown') {
    lines.push(`**Package Manager:** ${profile.packageManager}`);
  }

  // Structure
  const traits: string[] = [];
  if (profile.structure.isMonorepo) traits.push('monorepo');
  if (profile.structure.hasApi) traits.push('API');
  if (profile.structure.hasFrontend) traits.push('frontend');
  if (profile.structure.hasDatabase) traits.push('database');
  if (profile.structure.hasTests) traits.push('tests');
  if (profile.structure.hasCICD) traits.push('CI/CD');
  if (profile.structure.hasDocker) traits.push('Docker');
  if (traits.length > 0) {
    lines.push(`**Structure:** ${traits.join(', ')}`);
  }

  // Libraries by category
  const libEntries = Object.entries(profile.libraries).filter(([, libs]) => libs.length > 0);
  if (libEntries.length > 0) {
    lines.push('');
    lines.push('**Key Libraries:**');
    for (const [category, libs] of libEntries) {
      lines.push(`- ${category}: ${libs.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('## Meeting Learnings');
  lines.push('');
  lines.push('## Corrections');
  lines.push('');
  lines.push('## Project Conventions');
  lines.push('');

  return lines.join('\n');
}

/**
 * The filename for the project brief document.
 */
export const PROJECT_BRIEF_FILENAME = 'PROJECT_BRIEF.md';

/**
 * Generate a project brief template that agents reference for context.
 * Auto-fills what we know from the scan, leaves the rest for the user.
 */
export function generateProjectBrief(projectName: string, profile?: ProjectProfile): string {
  const lines: string[] = [];
  const date = new Date().toISOString().slice(0, 10);

  lines.push(`# ${projectName} — Project Brief`);
  lines.push('');
  lines.push(`> This file gives agents context about your project. Fill in the sections below`);
  lines.push(`> so meetings produce better, more relevant outcomes. ~200 words is enough.`);
  lines.push('');
  lines.push(`**Created:** ${date}`);
  lines.push('');

  // What is this project?
  lines.push('## What This Project Does');
  lines.push('');
  lines.push('<!-- 1-2 sentences: what does this project do and who is it for? -->');
  lines.push('');

  // Auto-filled tech context
  lines.push('## Technical Context');
  lines.push('');
  if (profile) {
    const langs = profile.languages.filter(l => l.percentage >= 5).map(l => l.name);
    if (langs.length > 0) lines.push(`**Stack:** ${langs.join(', ')}`);
    const fws = profile.frameworks.filter(f => f.confidence !== 'low');
    if (fws.length > 0) {
      lines.push(`**Frameworks:** ${fws.map(f => f.version ? `${f.name} ${f.version}` : f.name).join(', ')}`);
    }
    const traits: string[] = [];
    if (profile.structure.isMonorepo) traits.push('monorepo');
    if (profile.structure.hasApi) traits.push('API');
    if (profile.structure.hasFrontend) traits.push('frontend');
    if (profile.structure.hasDatabase) traits.push('database');
    if (profile.structure.hasTests) traits.push('tests');
    if (traits.length > 0) lines.push(`**Architecture:** ${traits.join(', ')}`);
  } else {
    lines.push('<!-- Stack, frameworks, architecture notes -->');
  }
  lines.push('');

  // Team
  lines.push('## Team');
  lines.push('');
  lines.push('<!-- Who works on this? How big is the team? What expertise is available? -->');
  lines.push('');

  // Current focus
  lines.push('## Current Focus');
  lines.push('');
  lines.push('<!-- What are you working on right now? What phase is the project in? -->');
  lines.push('');

  // Constraints
  lines.push('## Constraints & Preferences');
  lines.push('');
  lines.push('<!-- Anything agents should know: deployment targets, performance budgets,');
  lines.push('   coding style preferences, things to avoid, regulatory requirements, etc. -->');
  lines.push('');

  // Success criteria
  lines.push('## Success Criteria');
  lines.push('');
  lines.push('<!-- What does "done" look like for your current goals? -->');
  lines.push('');

  return lines.join('\n');
}
