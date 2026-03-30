#!/usr/bin/env node

/**
 * Agent Council MCP Server
 *
 * Connects Claude Code to Agent Council. The facilitator agent can:
 * - Check if someone is watching in the viewer
 * - Send meeting progress updates
 * - Check for human input from the viewer
 *
 * Usage: Add to ~/.claude/settings.json (CLI) or claude_desktop_config.json (Desktop):
 * {
 *   "mcpServers": {
 *     "agent-council": {
 *       "command": "node",
 *       "args": ["path/to/agent-council/mcp/server.mjs"]
 *     }
 *   }
 * }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import http from 'node:http';

const COUNCIL_PORT = process.env.COUNCIL_PORT || 3003;
const COUNCIL_URL = `http://localhost:${COUNCIL_PORT}`;
// Helper to make HTTP requests to Agent Council with retry
function councilRequest(path, method = 'GET', body = null, retries = 1) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    function tryRequest() {
      attempt++;
      const url = new URL(path, COUNCIL_URL);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json' },
      };

      const req = http.request({ ...options, timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('error', (err) => {
          reject(new Error(`Response stream error: ${err.message}`));
        });
        res.on('end', () => {
          // Handle non-2xx responses
          if (res.statusCode >= 400) {
            try {
              const parsed = JSON.parse(data);
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            }
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (err) => {
        if (attempt <= retries) {
          setTimeout(tryRequest, 500 * attempt);
          return;
        }
        reject(new Error(`Agent Council not reachable at ${COUNCIL_URL}: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempt <= retries) {
          setTimeout(tryRequest, 500 * attempt);
          return;
        }
        reject(new Error(`Request to Agent Council timed out`));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    }

    tryRequest();
  });
}

const server = new McpServer({
  name: 'agent-council',
  version: '0.1.0',
});

// Tool: Check if Agent Council viewer is active
server.tool(
  'council_status',
  'Check if Agent Council is running and if someone is watching the meeting viewer',
  {},
  async () => {
    try {
      const [projectData, meetingsData, suggestionsData, plannedData] = await Promise.all([
        councilRequest('/api/projects').catch(() => ({ activeProject: null, projects: [] })),
        councilRequest('/api/meetings').catch(() => []),
        councilRequest('/api/council/suggestions').catch(() => ({ suggestions: [] })),
        councilRequest('/api/council/planned?enrich=staleness').catch(() => ({ meetings: [] })),
      ]);
      const meetings = Array.isArray(meetingsData) ? meetingsData : [];
      const liveMeetings = meetings.filter(m => m.status === 'in-progress');
      const suggestions = suggestionsData.suggestions || [];
      const workItems = suggestions.filter(s => s.type === 'work_on');
      const otherSuggestions = suggestions.filter(s => s.type !== 'work_on');
      const planned = plannedData.meetings || [];
      const stalePlanned = planned.filter(m => m.staleness?.isStale);

      const result = {
        running: true,
        activeProject: projectData.activeProject,
        projectCount: projectData.projects?.length || 0,
        totalMeetings: meetings.length,
        liveMeetings: liveMeetings.length,
        liveMeetingFiles: liveMeetings.map(m => m.filename),
        viewerUrl: COUNCIL_URL + '/meetings',
      };

      // Build response text — include nudges inline so Claude sees them immediately
      const parts = [JSON.stringify(result, null, 2)];

      if (workItems.length > 0) {
        parts.push(`\n🔨 The user wants you to work on:\n${workItems.map((s, i) =>
          `${i + 1}. ${s.message}${s.value ? `\n   Context: ${s.value}` : ''}`
        ).join('\n')}`);
      }
      if (otherSuggestions.length > 0) {
        parts.push(`\n💡 ${otherSuggestions.length} suggestion(s) from the viewer`);
      }
      if (planned.length > 0) {
        const staleNote = stalePlanned.length > 0 ? ` (${stalePlanned.length} possibly stale)` : '';
        parts.push(`\n📋 ${planned.length} planned meeting(s)${staleNote}:\n${planned.map((m, i) => {
          let line = `${i + 1}. [${m.type}] ${m.topic}`;
          if (m.staleness?.isStale) {
            line += m.staleness.reason === 'keyword_match'
              ? ` ⚠️ likely resolved`
              : ` ⚠️ ${m.staleness.ageDays}d old`;
          }
          return line;
        }).join('\n')}`);
      }

      return {
        content: [{
          type: 'text',
          text: parts.join('\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            running: false,
            error: err.message,
            hint: 'Start Agent Council with: npm run dev (in the agent-council directory)',
          }, null, 2),
        }],
      };
    }
  }
);

// Tool: List meetings
server.tool(
  'council_meetings',
  'List recent meetings from Agent Council. Shows active and past meetings.',
  {
    project: z.string().optional().describe('Project name to filter by'),
  },
  async ({ project }) => {
    try {
      const params = project ? `?project=${encodeURIComponent(project)}` : '';
      const data = await councilRequest(`/api/meetings${params}`);
      const meetings = Array.isArray(data) ? data : [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: meetings.length,
            meetings: meetings.slice(0, 10).map(m => ({
              filename: m.filename,
              title: m.title,
              type: m.type,
              status: m.status,
              participants: m.participants,
              date: m.date,
            })),
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  }
);

// Tool: Read a specific meeting (structured summary + outcomes)
server.tool(
  'council_read_meeting',
  'Read a specific meeting by filename. Returns structured summary with title, type, participants, decisions, actions, and open questions — without the full raw content. Use this to recall what happened in a meeting.',
  {
    filename: z.string().describe('Meeting filename (e.g., "2026-03-31-design-review-live-meeting-experience.md")'),
  },
  async ({ filename }) => {
    try {
      const data = await councilRequest(`/api/meetings?file=${encodeURIComponent(filename)}`);
      if (!data || !data.content) {
        return { content: [{ type: 'text', text: `Meeting not found: ${filename}` }] };
      }

      const content = data.content;

      // Extract summary section (text between "## Summary" and the next ## heading)
      const summaryMatch = content.match(/##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n<!--\s*meeting-outcomes|$)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : null;

      // Extract tagged outcomes from the content
      const decisions = [];
      const actions = [];
      const openQuestions = [];

      // Try JSON appendix first (structured source)
      const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n(?:meeting-outcomes\s*)?-->/);
      if (jsonMatch) {
        try {
          const outcomes = JSON.parse(jsonMatch[1]);
          if (outcomes.decisions) decisions.push(...outcomes.decisions.map(d => d.text + (d.rationale ? ` — ${d.rationale}` : '')));
          if (outcomes.actions) actions.push(...outcomes.actions.map(a => a.text + (a.assignee ? ` (${a.assignee})` : '')));
          if (outcomes.open_questions) openQuestions.push(...outcomes.open_questions.map(q => (q.slug ? `[${q.slug}] ` : '') + q.text));
        } catch { /* fall through to inline parsing */ }
      }

      // Fall back to inline tag parsing if no JSON appendix
      if (decisions.length === 0 && actions.length === 0 && openQuestions.length === 0) {
        for (const line of content.split('\n')) {
          const decMatch = line.match(/\[DECISION\]\s*(.*)/);
          if (decMatch) decisions.push(decMatch[1].trim());
          const actMatch = line.match(/\[ACTION\]\s*(.*)/);
          if (actMatch) actions.push(actMatch[1].trim());
          const openMatch = line.match(/\[OPEN(?::([^\]]+))?\]\s*(.*)/);
          if (openMatch) openQuestions.push((openMatch[1] ? `[${openMatch[1]}] ` : '') + openMatch[2].trim());
        }
      }

      const result = {
        filename: data.filename,
        title: data.title,
        type: data.type,
        status: data.status,
        date: data.date,
        participants: data.participants,
        summary,
        outcomes: {
          decisions: decisions.length > 0 ? decisions : null,
          actions: actions.length > 0 ? actions : null,
          openQuestions: openQuestions.length > 0 ? openQuestions : null,
        },
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error reading meeting: ${err.message}` }],
      };
    }
  }
);

// Tool: Notify meeting event
server.tool(
  'council_notify',
  'Send a meeting progress update to Agent Council viewers. Use this to signal round changes, meeting start/end, or other status updates.',
  {
    event: z.enum(['meeting_starting', 'round_starting', 'round_complete', 'meeting_complete', 'agent_speaking']).describe('Type of event'),
    meeting: z.string().describe('Meeting filename'),
    detail: z.string().optional().describe('Additional detail (e.g., round number, agent name)'),
  },
  async ({ event, meeting, detail }) => {
    try {
      const data = await councilRequest('/api/council/events', 'POST', {
        event,
        meeting,
        detail,
        timestamp: new Date().toISOString(),
      });
      return {
        content: [{
          type: 'text',
          text: `Event "${event}" sent to Agent Council${detail ? ` (${detail})` : ''}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not notify: ${err.message}` }],
      };
    }
  }
);

// Tool: Check for human input
server.tool(
  'council_check_input',
  'Check if the human viewer has typed a message into the meeting through Agent Council. Returns any pending messages.',
  {
    meeting: z.string().describe('Meeting filename to check for input'),
  },
  async ({ meeting }) => {
    try {
      const data = await councilRequest(`/api/council/input?meeting=${encodeURIComponent(meeting)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            hasInput: data.messages?.length > 0,
            messages: data.messages || [],
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  }
);

// Tool: Check for suggestions from the viewer
server.tool(
  'council_check_suggestions',
  'Check if the Agent Council viewer has queued any suggestions. Suggestions are changes the user wants made to agents (move to team, change role, update description, etc.). The user makes suggestions through the Council UI; Claude picks them up here and applies them.',
  {},
  async () => {
    try {
      const data = await councilRequest('/api/council/suggestions');
      const suggestions = data.suggestions || [];
      if (suggestions.length === 0) {
        return {
          content: [{ type: 'text', text: 'No pending suggestions from Agent Council.' }],
        };
      }
      // Separate work_on items from other suggestions for clarity
      const workItems = suggestions.filter(s => s.type === 'work_on');
      const otherSuggestions = suggestions.filter(s => s.type !== 'work_on');

      const parts = [];
      if (workItems.length > 0) {
        parts.push(`🔨 ${workItems.length} work item(s) from the roadmap:\n${workItems.map((s, i) =>
          `${i + 1}. ${s.message}${s.value ? `\n   Context: ${s.value}` : ''}`
        ).join('\n')}`);
      }
      if (otherSuggestions.length > 0) {
        parts.push(`${otherSuggestions.length} suggestion(s):\n${otherSuggestions.map((s, i) =>
          `${i + 1}. [${s.type}] ${s.message}${s.agent ? ` (agent: ${s.agent})` : ''}${s.value ? ` → ${s.value}` : ''}`
        ).join('\n')}`);
      }

      return {
        content: [{
          type: 'text',
          text: parts.join('\n\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  }
);

// Tool: Get planned meetings
server.tool(
  'council_planned_meetings',
  'Get meetings that have been planned or recommended through Agent Council. These come from meeting summaries ("Recommended Next Meetings" sections) or from the user manually queuing meetings in the viewer. Returns a list of planned meetings with type, topic, and trigger conditions.',
  {},
  async () => {
    try {
      const data = await councilRequest('/api/council/planned?enrich=staleness');
      const meetings = data.meetings || [];
      if (meetings.length === 0) {
        return {
          content: [{ type: 'text', text: 'No planned meetings in Agent Council.' }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `${meetings.length} planned meeting(s):\n\n${meetings.map((m, i) => {
            let line = `${i + 1}. **${m.type}**: ${m.topic}`;
            if (m.trigger) line += `\n   When: ${m.trigger}`;
            if (m.source) line += `\n   Source: ${m.source}`;
            if (m.participants?.length) line += `\n   Suggested: ${m.participants.join(', ')}`;
            if (m.staleness?.isStale) {
              if (m.staleness.reason === 'keyword_match') {
                const matches = m.staleness.matchedItems.slice(0, 2).map(i => i.text.slice(0, 60)).join(', ');
                line += `\n   ⚠️ Likely stale — matches done work: ${matches}`;
              } else if (m.staleness.reason === 'age') {
                line += `\n   ⚠️ ${m.staleness.ageDays} days old — may be outdated`;
              }
            }
            return line;
          }).join('\n\n')}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  }
);

// Tool: Mark a planned meeting as running/done
server.tool(
  'council_update_planned',
  'Update the status of a planned meeting (mark as running when you start it, done when complete, dismissed if skipped).',
  {
    id: z.string().describe('The planned meeting ID'),
    status: z.enum(['running', 'done', 'dismissed']).describe('New status'),
  },
  async ({ id, status }) => {
    try {
      await councilRequest('/api/council/planned', 'PATCH', { id, status });
      return {
        content: [{ type: 'text', text: `Planned meeting ${id} marked as ${status}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  }
);

// Tool: Query tagged items across meetings
server.tool(
  'council_query',
  'Query decisions, open questions, and action items across all meetings. Use to get carry-forward context, check what was decided, or find unresolved items.',
  {
    mode: z.enum(['summary', 'unresolved', 'search']).describe('Query mode: summary (counts), unresolved (open items), search (text query)'),
    query: z.string().optional().describe('Search text (only for search mode)'),
    type: z.enum(['decision', 'open', 'action']).optional().describe('Filter by tag type'),
  },
  async ({ mode, query, type }) => {
    try {
      const params = new URLSearchParams();
      if (mode === 'summary') params.set('mode', 'summary');
      else if (mode === 'unresolved') params.set('mode', 'unresolved');
      else {
        if (query) params.set('q', query);
        if (type) params.set('type', type);
      }
      const url = `/api/meetings/tags?${params.toString()}`;

      const data = await councilRequest(url, 'GET');

      if (mode === 'summary') {
        return {
          content: [{ type: 'text', text: `Tag summary across ${data.meetingCount} meetings:\n- ${data.decisions} decisions\n- ${data.open} open questions\n- ${data.actions} action items` }],
        };
      }

      if (mode === 'unresolved') {
        const items = [];
        if (data.open?.length) {
          items.push(`Open questions (${data.open.length}):`);
          for (const o of data.open.slice(0, 15)) {
            const status = o.meetingStatus === 'in-progress' ? ' [LIVE]' : '';
            items.push(`  - [${o.meetingTitle ?? o.meeting}${status}] ${o.text}`);
          }
        }
        if (data.actions?.length) {
          items.push(`Action items (${data.actions.length}):`);
          for (const a of data.actions.slice(0, 15)) {
            const status = a.meetingStatus === 'in-progress' ? ' [LIVE]' : '';
            items.push(`  - [${a.meetingTitle ?? a.meeting}${status}] ${a.text}`);
          }
        }
        return {
          content: [{ type: 'text', text: items.length ? items.join('\n') : 'No unresolved items found.' }],
        };
      }

      // Search mode
      const results = data.results || [];
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results found${query ? ` for "${query}"` : ''}` }] };
      }
      const lines = results.slice(0, 20).map(r => {
        const status = r.meetingStatus === 'in-progress' ? ' [LIVE]' : '';
        return `[${r.type}] ${r.text}\n  → ${r.meetingTitle ?? r.meeting}${status} (${r.date ?? 'unknown date'})`;
      });
      return {
        content: [{ type: 'text', text: `Found ${results.length} result${results.length !== 1 ? 's' : ''}:\n\n${lines.join('\n\n')}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// Tool: Schedule a meeting for later
server.tool(
  'council_schedule_meeting',
  'Schedule a meeting for later. Use when you identify something that needs group discussion. The meeting appears in the viewer for the user to approve or run.',
  {
    type: z.string().describe('Meeting type: standup, design-review, strategy, architecture, retrospective, sprint-planning, incident-review'),
    topic: z.string().describe('What the meeting should discuss'),
    reason: z.string().optional().describe('Why this meeting is needed — what prompted it'),
    participants: z.array(z.string()).optional().describe('Suggested participants'),
  },
  async ({ type, topic, reason, participants }) => {
    try {
      const data = await councilRequest('/api/council/planned', 'POST', {
        type,
        topic,
        reason,
        participants,
        source: 'claude-mcp',
      });
      const id = data.id || data.meeting?.id || 'unknown';
      return {
        content: [{
          type: 'text',
          text: `Meeting scheduled: "${topic}" (${type}). Planned meeting ID: ${id}. It will appear in the Agent Council viewer for the user to approve or run.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not schedule meeting: ${err.message}` }],
      };
    }
  }
);

// Tool: Update an agent's metadata
server.tool(
  'council_update_agent',
  'Update an agent\'s metadata (model, team, role, or description). Use after meetings decide on role changes.',
  {
    filename: z.string().describe('Agent filename (e.g., "architect.md")'),
    field: z.enum(['model', 'team', 'role', 'description']).describe('Field to update'),
    value: z.string().describe('New value'),
  },
  async ({ filename, field, value }) => {
    try {
      await councilRequest('/api/agents', 'PATCH', {
        filename,
        field,
        value,
      });
      return {
        content: [{
          type: 'text',
          text: `Agent "${filename}" updated: ${field} → "${value}"`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not update agent: ${err.message}` }],
      };
    }
  }
);

// Tool: Append learnings to agent context files (with rolling window)
server.tool(
  'council_update_context',
  'Append meeting learnings to an agent\'s context file. Auto-trims to 50-line rolling window to prevent unbounded growth. Use after meetings to record what each agent learned.',
  {
    agent: z.string().describe('Agent name (e.g., "developer", "architect")'),
    entries: z.array(z.string()).describe('Array of learning entries to append (e.g., ["[2026-03-29 strategy] Key decision about X"])'),
  },
  async ({ agent, entries }) => {
    try {
      const data = await councilRequest('/api/agents/context', 'POST', {
        agent,
        entries,
      });
      return {
        content: [{
          type: 'text',
          text: `Added ${entries.length} entries to ${agent}'s context file (rolling window: 50 lines max).`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not update context: ${err.message}` }],
      };
    }
  }
);

// Tool: Push context to the meeting viewer
server.tool(
  'council_add_context',
  'Push context or research findings to the meeting viewer. Use when you discover relevant information during a session that the viewer should display.',
  {
    meeting: z.string().describe('Meeting filename this context relates to'),
    context: z.string().describe('The context text to display'),
    source: z.string().optional().describe('Where this context came from (e.g., "git log", "code analysis")'),
  },
  async ({ meeting, context, source }) => {
    try {
      await councilRequest('/api/council/context', 'POST', {
        meeting,
        context,
        source,
        timestamp: new Date().toISOString(),
      });
      return {
        content: [{
          type: 'text',
          text: `Context added to meeting "${meeting}"${source ? ` (source: ${source})` : ''}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not add context: ${err.message}` }],
      };
    }
  }
);

// Tool: Resolve an open question from a meeting
server.tool(
  'council_resolve_question',
  'Mark an open question from a meeting as resolved. Use when you fix or address something that was flagged as [OPEN:slug] in a meeting.',
  {
    slug: z.string().describe('The slug ID of the open question (e.g., "auth-flow", "api-versioning")'),
    resolution: z.string().describe('How the question was resolved'),
    meeting: z.string().optional().describe('Which meeting file to append the resolution to'),
  },
  async ({ slug, resolution, meeting }) => {
    try {
      const data = await councilRequest('/api/council/resolve', 'POST', {
        slug,
        resolution,
        meeting,
        timestamp: new Date().toISOString(),
      });
      return {
        content: [{
          type: 'text',
          text: `Resolved [OPEN:${slug}]: ${resolution}${meeting ? ` (appended to ${meeting})` : ''}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not resolve question: ${err.message}` }],
      };
    }
  }
);

// Tool: Get work items — the execution bridge
server.tool(
  'council_get_work_items',
  'Get actionable work items from meeting decisions. Use at the start of a coding session to see what the team decided should be built. Returns action items, open questions, and recent decisions — prioritized by recency. Filters out done and stale items automatically. This is how meeting decisions turn into code.',
  {
    filter: z.enum(['actions', 'open', 'decisions', 'all']).optional().describe('Filter by item type (default: all)'),
    limit: z.number().optional().describe('Max items to return (default: 15)'),
  },
  async ({ filter, limit }) => {
    try {
      const maxItems = limit || 15;

      // Fetch from roadmap API which includes status tracking
      const roadmapData = await councilRequest('/api/roadmap');
      const allItems = roadmapData.items || [];

      // Filter out done and stale items — only show active work
      const activeItems = allItems.filter(i => i.itemStatus === 'active');

      const actions = activeItems.filter(i => i.type === 'ACTION');
      const open = activeItems.filter(i => i.type === 'OPEN');
      const decisions = allItems
        .filter(i => i.type === 'DECISION')
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        .slice(0, maxItems);

      const sections = [];

      if (!filter || filter === 'all' || filter === 'actions') {
        if (actions.length > 0) {
          sections.push(`ACTION ITEMS (${actions.length}):`);
          for (const a of actions.slice(0, maxItems)) {
            const status = a.meetingStatus === 'in-progress' ? ' [LIVE]' : '';
            sections.push(`  → ${a.text}`);
            sections.push(`    from: ${a.meetingTitle || a.meeting}${status} (${a.date || 'unknown'})`);
          }
          sections.push('');
        }
      }

      if (!filter || filter === 'all' || filter === 'open') {
        if (open.length > 0) {
          sections.push(`OPEN QUESTIONS (${open.length}):`);
          for (const o of open.slice(0, maxItems)) {
            const slug = o.id ? ` [${o.id}]` : '';
            sections.push(`  ? ${o.text}${slug}`);
            sections.push(`    from: ${o.meetingTitle || o.meeting} (${o.date || 'unknown'})`);
          }
          sections.push('');
        }
      }

      if (!filter || filter === 'all' || filter === 'decisions') {
        if (decisions.length > 0) {
          sections.push(`RECENT DECISIONS (${decisions.length}):`);
          for (const d of decisions.slice(0, maxItems)) {
            sections.push(`  ✓ ${d.text}`);
            sections.push(`    from: ${d.meetingTitle || d.meeting} (${d.date || 'unknown'})`);
          }
        }
      }

      if (sections.length === 0) {
        return {
          content: [{ type: 'text', text: 'No work items found. Run a meeting to generate decisions and action items.' }],
        };
      }

      const doneCount = (roadmapData.counts?.done || 0);
      const staleCount = (roadmapData.counts?.stale || 0);
      const filteredNote = (doneCount + staleCount) > 0 ? ` (${doneCount} done, ${staleCount} archived — hidden)` : '';
      const summary = `${actions.length} action${actions.length !== 1 ? 's' : ''}, ${open.length} open question${open.length !== 1 ? 's' : ''}, ${decisions.length} recent decision${decisions.length !== 1 ? 's' : ''}${filteredNote}`;

      return {
        content: [{
          type: 'text',
          text: `Work items from Agent Council (${summary}):\n\n${sections.join('\n')}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not fetch work items: ${err.message}` }],
      };
    }
  }
);

// Tool: Session brief — opinionated 5-line brief for starting a coding session
server.tool(
  'council_session_brief',
  'Get a concise brief for starting a coding session: focus item, recent decisions (last 2 meetings), active actions (max 3), open questions (max 2). Call this at the START of any session.',
  {},
  async () => {
    try {
      const [meetingsData, roadmapData, suggestionsData] = await Promise.all([
        councilRequest('/api/meetings').catch(() => []),
        councilRequest('/api/roadmap').catch(() => ({ items: [] })),
        councilRequest('/api/council/suggestions').catch(() => ({ suggestions: [] })),
      ]);

      const meetings = Array.isArray(meetingsData) ? meetingsData : [];
      const items = roadmapData.items || [];
      const suggestions = suggestionsData.suggestions || [];

      const live = meetings.filter(m => m.status === 'in-progress');
      const workItems = suggestions.filter(s => s.type === 'work_on');
      const completed = meetings.filter(m => m.status === 'complete');

      // Recency windows
      const recent2Files = new Set(completed.slice(0, 2).map(m => m.filename));
      const recent3Files = new Set(completed.slice(0, 3).map(m => m.filename));

      // Decisions: last 2 meetings only, max 5
      const recentDecisions = items
        .filter(i => i.type === 'DECISION' && recent2Files.has(i.meeting))
        .slice(0, 5);

      // Actions: active only, prefer last 2 meetings, max 3
      const allActiveActions = items.filter(i => i.type === 'ACTION' && i.itemStatus === 'active');
      const recentActions = allActiveActions.filter(i => recent2Files.has(i.meeting));
      const priorityActions = (recentActions.length > 0 ? recentActions : allActiveActions).slice(0, 3);

      // Open questions: last 3 meetings, active only, max 2
      const allActiveOpen = items.filter(i => i.type === 'OPEN' && i.itemStatus === 'active');
      const recentOpen = allActiveOpen.filter(i => recent3Files.has(i.meeting)).slice(0, 2);

      // Focus: user nudge > recent action > recent decision > fallback
      let focusText;
      if (workItems.length > 0) {
        focusText = workItems[0].message;
      } else if (priorityActions.length > 0) {
        focusText = priorityActions[0].text.replace(/\s*—\s*assigned to \w+.*$/, '').trim();
      } else if (recentDecisions.length > 0) {
        const d = recentDecisions[0].text.split(' — ')[0].trim();
        focusText = d.length > 100 ? d.slice(0, 97) + '...' : d;
      } else {
        focusText = 'No active items. Try: council_quick_consult to ask an agent, or council_schedule_meeting to plan a discussion.';
      }

      const lines = [];

      if (live.length > 0) {
        lines.push(`⚡ LIVE: ${live.map(m => m.title || m.filename).join(', ')}`);
        lines.push('');
      }

      lines.push(`FOCUS: ${focusText}`);
      lines.push('');

      if (recentDecisions.length > 0) {
        lines.push('RECENT DECISIONS:');
        recentDecisions.forEach(d => {
          const text = d.text.length > 120 ? d.text.slice(0, 117) + '...' : d.text;
          lines.push(`  • ${text}`);
        });
        lines.push('');
      }

      lines.push('ACTIONS:');
      if (workItems.length > 0 || priorityActions.length > 0) {
        for (const w of workItems.slice(0, 2)) {
          lines.push(`  [user] ${w.message}`);
        }
        for (const a of priorityActions) {
          const text = a.text.replace(/\s*—\s*assigned to \w+.*$/, '').trim();
          lines.push(`  • ${text}`);
        }
      } else {
        lines.push('  None active. Use council_get_work_items for full history or council_schedule_meeting to discuss next steps.');
      }

      if (recentOpen.length > 0) {
        lines.push('');
        lines.push('OPEN:');
        recentOpen.forEach(o => lines.push(`  ? ${o.text}`));
      }

      if (completed[0]) {
        lines.push('');
        lines.push(`Last meeting: ${completed[0].title || completed[0].filename} (${completed[0].date})`);
      }

      return {
        content: [{
          type: 'text',
          text: `Agent Council — Session Brief\n\n${lines.join('\n')}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not generate brief: ${err.message}` }],
      };
    }
  }
);

// Tool: Check meeting pace — should the facilitator wait or proceed?
server.tool(
  'council_check_pace',
  'Check if the viewer wants you to wait before proceeding to the next round. In "guided" mode, wait for the human to click Proceed before starting the next round. In "auto" mode (default), proceed immediately. Call this BETWEEN rounds.',
  {
    meeting: z.string().describe('Meeting filename'),
  },
  async ({ meeting }) => {
    try {
      const data = await councilRequest(`/api/council/pace?meeting=${encodeURIComponent(meeting)}`);
      if (data.mode === 'guided' && !data.proceed) {
        return {
          content: [{
            type: 'text',
            text: `WAIT — The viewer is in "guided" mode. The human wants to review before the next round. Do NOT proceed until you call council_check_pace again and get proceed: true. Poll every 5-10 seconds.`,
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `Proceed — mode is "${data.mode}", you can start the next round.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not check pace (proceeding by default): ${err.message}` }],
      };
    }
  }
);

// Tool: AI context — narrative summary of recent project activity
server.tool(
  'council_ai_context',
  'Get an AI-generated narrative summary of recent project activity. More insightful than council_session_brief — synthesizes patterns, explains why things matter, and suggests current focus. Slower but richer. Call when you want deep context about project direction. Use codeAware=true to ground the narrative in actual code state (slower but more accurate).',
  {
    codeAware: z.boolean().optional().default(false).describe('When true, the AI inspects the project codebase using Read/Glob/Grep to verify decisions and ground the narrative in actual code state. Slower but more accurate.'),
  },
  async ({ codeAware }) => {
    try {
      const data = await councilRequest('/api/council/ai-context', 'POST', { codeAware });
      if (data.error) {
        return { content: [{ type: 'text', text: `Could not generate context: ${data.error}` }] };
      }
      const meta = `(${data.meetingsAnalyzed} meeting${data.meetingsAnalyzed !== 1 ? 's' : ''} analyzed${data.inProgressMeetings > 0 ? `, ${data.inProgressMeetings} in progress` : ''}${data.codeAware ? ', code-aware' : ''})`;
      return {
        content: [{
          type: 'text',
          text: `Agent Council — AI Context ${meta}\n\n${data.narrative}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not generate AI context: ${err.message}\n\nHint: Ensure CLAUDE_CODE_OAUTH_TOKEN is set in .env.local` }],
      };
    }
  }
);

// Tool: Mark an action item as done
server.tool(
  'council_mark_done',
  'Mark an action item as done after completing the work. Finds the best matching active item by text and updates its status. Use after implementing something from meeting decisions.',
  {
    text: z.string().describe('Text identifying the action item — partial match is fine'),
    note: z.string().optional().describe('Brief note about how it was done (optional)'),
  },
  async ({ text, note }) => {
    try {
      const roadmapData = await councilRequest('/api/roadmap');
      const items = roadmapData.items || [];

      // Only look at active ACTION items
      const active = items.filter(i => i.type === 'ACTION' && i.itemStatus === 'active');

      if (active.length === 0) {
        return { content: [{ type: 'text', text: 'No active action items found. All work may already be complete.' }] };
      }

      // Find best match by text substring
      const q = text.toLowerCase();
      const match = active.find(i => i.text.toLowerCase().includes(q));

      if (!match) {
        const preview = active.slice(0, 5).map(i => `  • ${i.text.slice(0, 80)}`).join('\n');
        return {
          content: [{
            type: 'text',
            text: `No active action item matching "${text}" found.\n\nActive items:\n${preview}`,
          }],
        };
      }

      await councilRequest('/api/roadmap', 'POST', {
        id: match.hash,
        status: 'done',
        ...(note ? { note } : {}),
      });

      return {
        content: [{
          type: 'text',
          text: `✓ Marked done: ${match.text}${note ? `\n  Note: ${note}` : ''}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Could not mark item done: ${err.message}` }] };
    }
  }
);

// Tool: Quick consult — ask a single agent one question, get one answer
server.tool(
  'council_quick_consult',
  'Ask a single agent one question and get one direct answer — no meeting overhead. Use when you need a quick perspective from a specific role (architect, critic, developer, designer, north-star, project-manager) without running a full meeting.',
  {
    question: z.string().describe('The question to ask'),
    agent: z.enum(['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager'])
      .optional()
      .describe('Which agent to consult (default: critic)'),
    codeAware: z.boolean().optional()
      .describe('When true, the agent can read the project codebase (Read/Glob/Grep) to ground its answer in actual code. Slower but more accurate for technical questions. Default: false.'),
  },
  async ({ question, agent = 'critic', codeAware = false }) => {
    try {
      const result = await councilRequest('/api/council/quick-consult', 'POST', { question, agent, codeAware });
      if (result.error) {
        return { content: [{ type: 'text', text: `Quick consult failed: ${result.error}` }] };
      }
      const label = codeAware ? `${result.agent} (code-aware)` : result.agent;
      return {
        content: [{
          type: 'text',
          text: `[${label}]\n\n${result.answer}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Quick consult error: ${err.message}` }] };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
