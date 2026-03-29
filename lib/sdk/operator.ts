/**
 * SDK Operator — the orchestrator agent for Agent Council.
 *
 * Reads agent .md files from the project's .claude/agents/ directory
 * and converts them into Agent SDK subagent definitions. The operator
 * delegates to these subagents for specialized analysis.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '@/lib/agent-templates';

export interface SubagentDefinition {
  description: string;
  prompt: string;
  tools: string[];
}

/** The operator's system prompt — defines its role as orchestrator */
export const OPERATOR_SYSTEM_PROMPT = `You are the Operator for Agent Council. You orchestrate work by delegating to specialized subagents.

Your role:
- Understand what needs to be done
- Delegate to the right subagent(s) for the task
- Synthesize their findings into a coherent result
- Make decisions when subagents disagree

You have access to subagents that match the project's agent team. Use them.
For example, ask the architect about system design, the developer about implementation,
the critic about risks, the security-reviewer about auth/data safety.

You are not a participant — you are the coordinator. Don't do the analysis yourself
when a subagent is better suited. But DO synthesize and make final calls.`;

/**
 * Load agent files and convert to SDK subagent definitions.
 * Reads from the project's .claude/agents/ directory.
 */
export async function loadSubagents(agentsDir: string): Promise<Record<string, SubagentDefinition>> {
  const agents: Record<string, SubagentDefinition> = {};

  let files: string[];
  try {
    const entries = await readdir(agentsDir);
    files = entries.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
  } catch {
    return agents; // No agents directory
  }

  for (const filename of files) {
    try {
      const content = await readFile(path.join(agentsDir, filename), 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);

      const name = (frontmatter['name'] as string) ?? filename.replace('.md', '');
      const description = (frontmatter['description'] as string) ?? '';

      // Skip the facilitator — the operator IS the facilitator
      if (name === 'facilitator') continue;

      // Build the subagent prompt from the agent's body content
      const prompt = body.trim();

      // Default tools for subagents — read-only analysis
      const defaultTools = ['Read', 'Glob', 'Grep'];

      agents[name] = {
        description,
        prompt,
        tools: defaultTools,
      };
    } catch {
      // Skip unreadable agent files
    }
  }

  return agents;
}

/**
 * Load subagents and also read context files for richer knowledge.
 */
export async function loadSubagentsWithContext(agentsDir: string): Promise<Record<string, SubagentDefinition>> {
  const agents = await loadSubagents(agentsDir);

  // Enrich with context files if they exist
  for (const [name, agent] of Object.entries(agents)) {
    try {
      const contextPath = path.join(agentsDir, `${name}.context.md`);
      const context = await readFile(contextPath, 'utf-8');
      agent.prompt = `${agent.prompt}\n\n---\n\n## Project Context\n\n${context}`;
    } catch {
      // No context file — that's fine
    }
  }

  return agents;
}
