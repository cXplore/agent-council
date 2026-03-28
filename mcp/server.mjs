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
import http from 'http';

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
      const [projectData, meetingsData] = await Promise.all([
        councilRequest('/api/projects'),
        councilRequest('/api/meetings').catch(() => []),
      ]);
      const meetings = Array.isArray(meetingsData) ? meetingsData : [];
      const liveMeetings = meetings.filter(m => m.status === 'in-progress');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            running: true,
            activeProject: projectData.activeProject,
            projectCount: projectData.projects?.length || 0,
            totalMeetings: meetings.length,
            liveMeetings: liveMeetings.length,
            liveMeetingFiles: liveMeetings.map(m => m.filename),
            viewerUrl: COUNCIL_URL + '/meetings',
          }, null, 2),
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
      return {
        content: [{
          type: 'text',
          text: `${suggestions.length} suggestion(s) from Agent Council:\n\n${suggestions.map((s, i) =>
            `${i + 1}. [${s.type}] ${s.message}${s.agent ? ` (agent: ${s.agent})` : ''}${s.value ? ` → ${s.value}` : ''}`
          ).join('\n')}`,
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
      const data = await councilRequest('/api/council/planned');
      const meetings = data.meetings || [];
      if (meetings.length === 0) {
        return {
          content: [{ type: 'text', text: 'No planned meetings in Agent Council.' }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `${meetings.length} planned meeting(s):\n\n${meetings.map((m, i) =>
            `${i + 1}. **${m.type}**: ${m.topic}${m.trigger ? `\n   When: ${m.trigger}` : ''}${m.source ? `\n   Source: ${m.source}` : ''}${m.participants?.length ? `\n   Suggested: ${m.participants.join(', ')}` : ''}`
          ).join('\n\n')}`,
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
  'Get actionable work items from meeting decisions. Use at the start of a coding session to see what the team decided should be built. Returns action items, open questions, and recent decisions — prioritized by recency. This is how meeting decisions turn into code.',
  {
    filter: z.enum(['actions', 'open', 'decisions', 'all']).optional().describe('Filter by item type (default: all)'),
    limit: z.number().optional().describe('Max items to return (default: 15)'),
  },
  async ({ filter, limit }) => {
    try {
      const maxItems = limit || 15;

      // Fetch unresolved items (actions + open questions)
      const unresolvedData = await councilRequest('/api/meetings/tags?mode=unresolved');
      const actions = unresolvedData.actions || [];
      const open = unresolvedData.open || [];

      // Fetch recent decisions
      const decisionsData = await councilRequest('/api/meetings/tags?type=decision');
      const decisions = (decisionsData.results || []).slice(0, maxItems);

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

      const summary = `${actions.length} action${actions.length !== 1 ? 's' : ''}, ${open.length} open question${open.length !== 1 ? 's' : ''}, ${decisions.length} recent decision${decisions.length !== 1 ? 's' : ''}`;

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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
