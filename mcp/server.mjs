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
function councilRequest(path, method = 'GET', body = null, retries = 1, timeoutMs = 10000) {
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

      const req = http.request({ ...options, timeout: timeoutMs }, (res) => {
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

// Wrap tool handlers with global error boundary — catches any uncaught errors
// and returns them as isError:true responses instead of crashing the MCP connection.
function safeTool(name, description, schema, handler) {
  safeTool(name, description, schema, async (params) => {
    try {
      return await handler(params);
    } catch (err) {
      return {
        content: [{ type: 'text', text: `[${name}] Unexpected error: ${err.message}` }],
        isError: true,
      };
    }
  });
}

// Tool: Check if Agent Council viewer is active
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: List meetings
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Read a specific meeting (structured summary + outcomes)
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Create a new meeting file with proper structure
safeTool(
  'council_create_meeting',
  'Create a new meeting file with proper metadata and structure. Returns the filename for use with council_notify and other tools. The meeting is created with status "in-progress" — write agent contributions to it, then close it.',
  {
    title: z.string().describe('Meeting title (e.g., "Design Review: API Caching Strategy")'),
    type: z.enum(['standup', 'design-review', 'strategy', 'architecture', 'sprint-planning', 'retrospective', 'incident-review', 'quick-consult', 'direction-check']).describe('Meeting format'),
    participants: z.array(z.string()).optional().describe('Agent names participating (e.g., ["project-manager", "critic", "north-star"])'),
    context: z.string().optional().describe('Context section content — what prompted this meeting, relevant project state'),
    carryForward: z.string().optional().describe('Carry-forward from previous meetings — unresolved OPEN items or pending ACTIONs'),
  },
  async ({ title, type, participants, context, carryForward }) => {
    try {
      const data = await councilRequest('/api/meetings', 'PUT', {
        title,
        type,
        participants: participants || [],
        context: context || null,
        carryForward: carryForward || null,
      });

      const lines = [`Meeting created: ${data.filename}`];
      lines.push(`  Title: ${data.title}`);
      lines.push(`  Type: ${data.type}`);
      lines.push(`  Status: ${data.status}`);
      if (data.participants?.length) {
        lines.push(`  Participants: ${data.participants.join(', ')}`);
      }
      lines.push('');
      lines.push('Next steps:');
      lines.push('  1. Call council_notify(event: "meeting_starting", meeting: "' + data.filename + '")');
      lines.push('  2. Write agent contributions to the file');
      lines.push('  3. Call council_notify(event: "meeting_complete", meeting: "' + data.filename + '") when done');

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed to create meeting: ${err.message}` }], isError: true };
    }
  }
);

// Tool: Append content to an in-progress meeting (agent responses, round markers)
safeTool(
  'council_append_to_meeting',
  'Append content to an in-progress meeting file — agent responses, round markers, or other text. Use this to build up the meeting hub file incrementally.',
  {
    filename: z.string().describe('Meeting filename'),
    content: z.string().describe('Content to append (e.g., round header + agent response)'),
  },
  async ({ filename, content }) => {
    try {
      const data = await councilRequest('/api/meetings', 'PATCH', {
        file: filename,
        content,
      });

      return {
        content: [{ type: 'text', text: `Appended to ${data.filename} (${content.length} chars)` }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed to append: ${err.message}` }], isError: true };
    }
  }
);

// Tool: Close a meeting by setting status to complete
safeTool(
  'council_close_meeting',
  'Close a meeting by setting its status to "complete". Optionally append final content and/or structured outcomes before closing. Use the outcomes parameter to avoid JSON-in-JSON escaping — the server formats the appendix.',
  {
    filename: z.string().describe('Meeting filename (e.g., "2026-03-30-design-review-api-caching.md")'),
    appendContent: z.string().optional().describe('Text content to append before closing (e.g., summary section). Raw markdown, not JSON.'),
    outcomes: z.object({
      decisions: z.array(z.object({
        text: z.string().describe('The decision text'),
        rationale: z.string().optional().describe('Why this was decided'),
      })).optional().describe('Decisions made in the meeting'),
      actions: z.array(z.object({
        text: z.string().describe('The action item text'),
        assignee: z.string().optional().describe('Who should do this'),
      })).optional().describe('Action items from the meeting'),
      openQuestions: z.array(z.object({
        text: z.string().describe('The open question text'),
        slug: z.string().optional().describe('Short slug for tracking (e.g., "api-versioning")'),
      })).optional().describe('Unresolved questions to carry forward'),
    }).optional().describe('Structured outcomes — server formats the JSON appendix. Preferred over embedding JSON in appendContent.'),
  },
  async ({ filename, appendContent, outcomes }) => {
    try {
      const data = await councilRequest('/api/meetings', 'PATCH', {
        file: filename,
        status: 'complete',
        content: appendContent || null,
        outcomes: outcomes || null,
      });

      const parts = [`Meeting closed: ${data.filename}`, 'Status: complete'];
      if (data.appended) parts.push('Summary appended');
      if (data.outcomesAppended) parts.push('Outcomes appendix generated');

      return {
        content: [{ type: 'text', text: parts.join('\n') }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed to close meeting: ${err.message}` }], isError: true };
    }
  }
);

// Tool: Notify meeting event
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Check for human input
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Check for suggestions from the viewer
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Get planned meetings
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Mark a planned meeting as running/done
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Query tagged items across meetings
safeTool(
  'council_query',
  'Query decisions, open questions, and action items across all meetings. Use to get carry-forward context, check what was decided, or find unresolved items. Use mode=recall with a topic to find relevant decisions during coding — returns decisions and open questions with surrounding context.\n\nModes:\n- summary: Returns counts of decisions, actions, and open questions across all meetings. Fast, good for orientation.\n- unresolved: Returns all active (not done/resolved) action items and open questions. Use at session start to see pending work.\n- search: Full-text search across all tagged items. Combine with type filter (decision/open/action) to narrow results.\n- recall: Topic-based semantic search — finds decisions and open questions relevant to a topic string. Best for "what did we decide about X?" queries. Supports date_from/date_to filters and types parameter (comma-separated: decision,open,action).',
  {
    mode: z.enum(['summary', 'unresolved', 'search', 'recall']).describe('Query mode: summary (counts), unresolved (open items), search (text query), recall (topic-based decision search with context)'),
    query: z.string().optional().describe('Search text (for search and recall modes)'),
    type: z.enum(['decision', 'open', 'action']).optional().describe('Filter by tag type (search mode only)'),
    date_from: z.string().optional().describe('Start date filter YYYY-MM-DD inclusive (recall mode only)'),
    date_to: z.string().optional().describe('End date filter YYYY-MM-DD inclusive (recall mode only)'),
    types: z.string().optional().describe('Comma-separated tag types to include in recall: decision,open,action (recall mode only, default: decision,open)'),
  },
  async ({ mode, query, type, date_from, date_to, types }) => {
    try {
      const params = new URLSearchParams();
      if (mode === 'summary') params.set('mode', 'summary');
      else if (mode === 'unresolved') params.set('mode', 'unresolved');
      else if (mode === 'recall') {
        params.set('mode', 'recall');
        if (query) params.set('q', query);
        if (date_from) params.set('date_from', date_from);
        if (date_to) params.set('date_to', date_to);
        if (types) params.set('types', types);
      } else {
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

      if (mode === 'recall') {
        const results = data.results || [];
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No decisions or open questions found for topic "${query || '(none)'}"` }] };
        }
        const lines = results.map(r => {
          const typeLabel = r.type === 'OPEN' ? 'OPEN QUESTION' : r.type === 'ACTION' ? 'ACTION' : 'DECISION';
          const ctx = r.context ? `\n  Context: ${r.context.replace(/\n/g, '\n  ')}` : '';
          return `[${typeLabel}] ${r.text}\n  From: ${r.meetingTitle ?? r.meeting} (${r.date ?? 'unknown date'})${ctx}`;
        });
        return {
          content: [{ type: 'text', text: `Found ${results.length} relevant item${results.length !== 1 ? 's' : ''} for "${query}":\n\n${lines.join('\n\n')}` }],
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
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool: Schedule a meeting for later
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Update an agent's metadata
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Append learnings to agent context files (with rolling window)
safeTool(
  'council_update_context',
  'Append meeting learnings to an agent\'s context file. Auto-trims to 50-line rolling window to prevent unbounded growth. Use after meetings to record what each agent learned. Can also record corrections when an agent was wrong.',
  {
    agent: z.string().describe('Agent name (e.g., "developer", "architect")'),
    entries: z.array(z.string()).optional().describe('Array of learning entries to append (e.g., ["[2026-03-29 strategy] Key decision about X"])'),
    correction: z.string().optional().describe('A correction record when an agent was wrong. Format: "[date] [CORRECTION] In [meeting], claimed X. Actual: Y. Update: Z." Corrections persist separately and are not subject to the rolling window.'),
  },
  async ({ agent, entries, correction }) => {
    try {
      const body = { agent };
      if (entries) body.entries = entries;
      if (correction) body.correction = correction;
      await councilRequest('/api/agents/context', 'POST', body);
      const parts = [];
      if (entries?.length) parts.push(`Added ${entries.length} learning entries`);
      if (correction) parts.push('Added 1 correction record');
      return {
        content: [{
          type: 'text',
          text: `${parts.join('. ')} to ${agent}'s context file.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not update context: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// Tool: Get context health report for all agents
safeTool(
  'council_context_health',
  'Get a health/staleness report for all agent context files. Shows capacity usage, date ranges, stale entries, and correction counts. Use to assess whether agent context is fresh and reliable before production use.',
  {},
  async () => {
    try {
      const data = await councilRequest('/api/agents/context');
      const agents = data.agents || [];
      if (agents.length === 0) {
        return {
          content: [{ type: 'text', text: 'No agent context files found.' }],
        };
      }
      const lines = ['# Agent Context Health Report\n'];
      for (const a of agents) {
        const status = a.staleEntries > 0 ? `⚠ ${a.staleEntries} stale (>${a.staleDays}d)` : '✓ fresh';
        lines.push(`**${a.agent}** — ${a.totalLearnings} learnings (${a.capacityUsed}% capacity), ${a.totalCorrections} corrections`);
        lines.push(`  Range: ${a.oldestEntryDate || 'n/a'} → ${a.newestEntryDate || 'n/a'} | ${status}`);
      }
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Could not get context health: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// Tool: Push context to the meeting viewer
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Resolve an open question from a meeting
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: Get work items — the execution bridge
safeTool(
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
          // Heuristic: questions containing deferral patterns are "deferred", not actively open
          const deferralPatterns = /\b(revisit when|build when|defer until|trigger:|Phase 2:)\b/i;
          const activeOpen = open.filter(o => !deferralPatterns.test(o.text || ''));
          const deferredCount = open.length - activeOpen.length;

          // Cap open questions at 5 by default (full list via council_query)
          const openCap = filter === 'open' ? maxItems : 5;
          const shownOpen = activeOpen.slice(0, openCap);
          const hiddenCount = activeOpen.length - shownOpen.length;

          sections.push(`OPEN QUESTIONS (${activeOpen.length}${deferredCount > 0 ? `, ${deferredCount} deferred hidden` : ''}):`);
          for (const o of shownOpen) {
            const slug = o.id ? ` [${o.id}]` : '';
            sections.push(`  ? ${o.text}${slug}`);
            sections.push(`    from: ${o.meetingTitle || o.meeting} (${o.date || 'unknown'})`);
          }
          if (hiddenCount > 0) {
            sections.push(`  ... ${hiddenCount} more — use council_query(mode: "unresolved", type: "open") for full list`);
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
        isError: true,
      };
    }
  }
);

// Tool: Session brief — opinionated 5-line brief for starting a coding session
safeTool(
  'council_session_brief',
  'Get a concise brief for starting a coding session: focus item, recent decisions (last 2 meetings), active actions (max 3), open questions (max 2), and aging items that need attention (stale actions, at-risk open questions). Call this at the START of any session.',
  {},
  async () => {
    try {
      const [meetingsData, roadmapData, suggestionsData, projectsData] = await Promise.all([
        councilRequest('/api/meetings').catch(() => []),
        councilRequest('/api/roadmap').catch(() => ({ items: [] })),
        councilRequest('/api/council/suggestions').catch(() => ({ suggestions: [] })),
        councilRequest('/api/projects').catch(() => ({ projects: [], activeProject: '' })),
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

      // Needs Attention: active items that fell off the recency window
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Aging actions: active, NOT in recent 2 meetings, older than 3 days
      const agingActions = allActiveActions
        .filter(i => !recent2Files.has(i.meeting) && i.date && new Date(i.date) < threeDaysAgo)
        .slice(0, 3);

      // At-risk open questions: active, NOT in recent 3 meetings (approaching archival threshold)
      const atRiskOpen = allActiveOpen
        .filter(i => !recent3Files.has(i.meeting))
        .slice(0, 3);

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
        focusText = 'No active items. Try: council_list_agents to see available agents, council_quick_consult to ask one, or council_schedule_meeting to plan a discussion.';
      }

      // Project context from auto-scan profile
      const allProjects = projectsData.projects || [];
      const activeProjectName = projectsData.activeProject || '';
      const activeProject = allProjects.find(p => p.name === activeProjectName);
      const profile = activeProject?.profile;

      const lines = [];

      if (live.length > 0) {
        lines.push(`⚡ LIVE: ${live.map(m => m.title || m.filename).join(', ')}`);
        lines.push('');
      }

      if (activeProject) {
        lines.push(`PROJECT: ${activeProjectName} (${activeProject.path})`);
        if (profile) {
          const langs = (profile.languages || []).slice(0, 3).map(l => l.name).join(', ');
          const frameworks = (profile.frameworks || []).map(f => f.name).join(', ');
          const parts = [];
          if (langs) parts.push(langs);
          if (frameworks) parts.push(frameworks);
          if (profile.structure?.isMonorepo) parts.push('monorepo');
          if (parts.length > 0) lines.push(`  Stack: ${parts.join(' · ')}`);
          const cb = profile.coverageBoundaries;
          if (cb) {
            lines.push(`  Coverage: ${cb.filesCovered} files scanned | ${cb.knownDomains.length} known domains, ${cb.unknownDomains.length} hedged`);
          }
        }
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
        lines.push('  None active. Use council_list_agents to discover agents, council_get_work_items for full history, or council_schedule_meeting to discuss next steps.');
      }

      if (recentOpen.length > 0) {
        lines.push('');
        lines.push('OPEN:');
        recentOpen.forEach(o => lines.push(`  ? ${o.text}`));
      }

      // Needs Attention: aging items that fell off the recency window
      if (agingActions.length > 0 || atRiskOpen.length > 0) {
        lines.push('');
        lines.push('NEEDS ATTENTION:');
        for (const a of agingActions) {
          const text = a.text.replace(/\s*—\s*assigned to \w+.*$/, '').trim();
          const age = Math.floor((now.getTime() - new Date(a.date).getTime()) / (24 * 60 * 60 * 1000));
          lines.push(`  ⚠ Action (${age}d old): ${text.length > 100 ? text.slice(0, 97) + '...' : text}`);
          lines.push(`    from: ${a.meetingTitle || a.meeting}`);
        }
        for (const o of atRiskOpen) {
          lines.push(`  ⚠ Open question (at archival risk): ${o.text.length > 100 ? o.text.slice(0, 97) + '...' : o.text}`);
          lines.push(`    from: ${o.meetingTitle || o.meeting}`);
        }
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
        isError: true,
      };
    }
  }
);

// Tool: Check meeting pace — should the facilitator wait or proceed?
safeTool(
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
        isError: true,
      };
    }
  }
);

// Tool: AI context — narrative summary of recent project activity
safeTool(
  'council_ai_context',
  'Get an AI-generated narrative summary of recent project activity. More insightful than council_session_brief — synthesizes patterns, explains why things matter, and suggests current focus. Slower but richer (takes 30-60s). Call when you want deep context about project direction — e.g., at the start of a session, or before making architectural decisions. Uses the Agent SDK to analyze recent meetings, decisions, actions, and open questions, then produces a cohesive narrative. Use codeAware=true to ground the narrative in actual code state (slower but more accurate — the AI will Read/Glob/Grep the project to verify claims).',
  {
    codeAware: z.boolean().optional().default(false).describe('When true, the AI inspects the project codebase using Read/Glob/Grep to verify decisions and ground the narrative in actual code state. Slower but more accurate.'),
  },
  async ({ codeAware }) => {
    try {
      const data = await councilRequest('/api/council/ai-context', 'POST', { codeAware }, 1, 120000); // 2 min timeout
      if (data.error) {
        return { content: [{ type: 'text', text: `Could not generate context: ${data.error}` }], isError: true };
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
        isError: true,
      };
    }
  }
);

// Tool: Mark an action item as done
safeTool(
  'council_mark_done',
  'Mark an action item or open question as done after completing the work. Finds the best matching active item by text and updates its status. Use after implementing something from meeting decisions.',
  {
    text: z.string().describe('Text identifying the action item — partial match is fine'),
    note: z.string().optional().describe('Brief note about how it was done (optional)'),
  },
  async ({ text, note }) => {
    try {
      const roadmapData = await councilRequest('/api/roadmap');
      const items = roadmapData.items || [];

      // Look at active ACTION and OPEN items
      const active = items.filter(i => (i.type === 'ACTION' || i.type === 'OPEN') && i.itemStatus === 'active');

      if (active.length === 0) {
        return { content: [{ type: 'text', text: 'No active items found. All work may already be complete.' }] };
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
      return { content: [{ type: 'text', text: `Could not mark item done: ${err.message}` }], isError: true };
    }
  }
);

// Tool: Quick consult — ask a single agent one question, get one answer
safeTool(
  'council_list_agents',
  'List all available agents with their roles, teams, and descriptions. Use to discover which agents exist before consulting them with council_quick_consult or referencing them in meetings.',
  {},
  async () => {
    try {
      const data = await councilRequest('/api/agents');
      const agents = data.agents || data || [];
      if (agents.length === 0) {
        return { content: [{ type: 'text', text: 'No agents found. Set up agents through the Agent Council viewer.' }] };
      }

      const lines = [`Available agents (${agents.length}):\n`];
      // Group by team
      const teams = {};
      for (const a of agents) {
        const team = a.team || 'unassigned';
        if (!teams[team]) teams[team] = [];
        teams[team].push(a);
      }
      for (const [team, members] of Object.entries(teams)) {
        lines.push(`[${team}]`);
        for (const a of members) {
          const model = a.model ? ` (${a.model})` : '';
          const required = a.required ? ' *required*' : '';
          lines.push(`  ${a.name || a.filename.replace('.md', '')} — ${a.description || a.role || 'no description'}${model}${required}`);
        }
        lines.push('');
      }

      return { content: [{ type: 'text', text: lines.join('\n').trim() }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Could not list agents: ${err.message}` }], isError: true };
    }
  }
);

safeTool(
  'council_triage',
  'Should you run a meeting on this? Scores a decision on 4 dimensions (reversibility, blast radius, novelty, confidence) and recommends: no meeting, quick consult, direction check, or full meeting. Use before deciding whether to call a meeting.',
  {
    decision: z.string().describe('Brief description of the decision or question you\'re considering'),
  },
  async ({ decision }) => {
    // Score using the decision-complexity rubric from the facilitator template
    // Each dimension: 0 (low) to 2 (high)
    const rubric = `You are a decision triage assistant. Score this decision on 4 dimensions (0-2 each):

1. **Reversibility** — 0: trivially undone (config change, feature flag) | 1: reversible with effort (refactor, migration rollback) | 2: practically irreversible (public API contract, data deletion, external commitment)
2. **Blast radius** — 0: single file/function | 1: multiple components/services | 2: entire system, external users, or cross-team
3. **Novelty** — 0: done before, established pattern | 1: variation on known approach | 2: first time, no precedent in this codebase
4. **Confidence** — 0: team agrees, high certainty | 1: reasonable debate possible | 2: genuine uncertainty, multiple valid approaches

Decision to triage: "${decision}"

Respond with ONLY this JSON format (no other text):
{
  "reversibility": <0-2>,
  "blastRadius": <0-2>,
  "novelty": <0-2>,
  "confidence": <0-2>,
  "total": <sum>,
  "reasoning": "<one sentence explaining the dominant factor>"
}`;

    try {
      const result = await query({
        system: rubric,
        prompt: 'Score this decision now.',
      });
      const responseText = typeof result === 'string' ? result : result?.text || JSON.stringify(result);

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return { content: [{ type: 'text', text: `Could not parse triage result. Raw response:\n${responseText}` }], isError: true };
      }

      const scores = JSON.parse(jsonMatch[0]);
      const total = scores.total ?? (scores.reversibility + scores.blastRadius + scores.novelty + scores.confidence);

      let recommendation, meetingType;
      if (total <= 1) {
        recommendation = 'No meeting needed. Just decide and code.';
        meetingType = 'none';
      } else if (total <= 3) {
        recommendation = 'Quick consult — ask one agent via council_quick_consult.';
        meetingType = 'quick_consult';
      } else if (total <= 5) {
        recommendation = 'Direction check — 1 round, 2 agents. Confirm approach before starting. Use council_multi_consult with rounds=1.';
        meetingType = 'direction_check';
      } else if (total === 6) {
        recommendation = 'Quick meeting — 1 round, 3 agents. Get multiple perspectives. Use council_multi_consult with rounds=1 and 3 agents.';
        meetingType = 'quick_meeting';
      } else {
        recommendation = 'Full meeting — 2-3 rounds, 4-5 agents. Multi-round deliberation needed. Use council_multi_consult with rounds=2.';
        meetingType = 'full_meeting';
      }

      const lines = [
        `Decision Triage: "${decision}"`,
        '',
        `Scores (0=low, 2=high):`,
        `  Reversibility: ${scores.reversibility}  |  Blast radius: ${scores.blastRadius}`,
        `  Novelty: ${scores.novelty}        |  Confidence: ${scores.confidence}`,
        `  Total: ${total}/8`,
        '',
        `Reasoning: ${scores.reasoning}`,
        '',
        `→ ${recommendation}`,
      ];

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Triage failed: ${err.message}` }], isError: true };
    }
  }
);

safeTool(
  'council_quick_consult',
  'Ask a single agent one question and get one direct answer — no meeting overhead (takes 15-30s). Use when you need a quick perspective from a specific role without running a full meeting. Available agents: architect (system design, trade-offs), critic (challenges assumptions, finds flaws), developer (implementation, code quality), designer (UI/UX, user flows), north-star (vision, impact, possibilities), project-manager (scope, priorities, what\'s real). Use topic to ground the agent in relevant past decisions — e.g., topic="error handling" will inject related decisions/open questions from past meetings into the agent\'s context. Use codeAware=true for technical questions where the agent should read actual source files.',
  {
    question: z.string().describe('The question to ask'),
    agent: z.enum(['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager'])
      .optional()
      .describe('Which agent to consult (default: critic)'),
    codeAware: z.boolean().optional()
      .describe('When true, the agent can read the project codebase (Read/Glob/Grep) to ground its answer in actual code. Slower but more accurate for technical questions. Default: false.'),
    topic: z.string().optional()
      .describe('When provided, auto-searches relevant decisions and open questions from past meetings and injects them into the agent context. Grounds the response in institutional memory. Example: "error handling", "MCP tools", "meeting viewer".'),
  },
  async ({ question, agent = 'critic', codeAware = false, topic }) => {
    try {
      const body = { question, agent, codeAware };
      if (topic) body.topic = topic;
      const result = await councilRequest('/api/council/quick-consult', 'POST', body, 1, 120000); // 2 min timeout
      if (result.error) {
        return { content: [{ type: 'text', text: `Quick consult failed: ${result.error}` }], isError: true };
      }
      const parts = [codeAware ? 'code-aware' : '', topic ? `topic: ${topic}` : ''].filter(Boolean).join(', ');
      const label = parts ? `${result.agent} (${parts})` : result.agent;
      return {
        content: [{
          type: 'text',
          text: `[${label}]\n\n${result.answer}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Quick consult error: ${err.message}` }], isError: true };
    }
  }
);

safeTool(
  'council_multi_consult',
  'Run a structured multi-agent meeting. Round 1: agents respond independently in parallel. Round 2+: agents receive previous rounds as context and respond to each other — challenging, building on, and synthesizing ideas. Results are written to a meeting file. Use when you want deliberation from 2-6 agents.\n\nTiming: 1 round ≈ 1-2 min, 2 rounds ≈ 2-4 min, 3 rounds ≈ 3-5 min. The server has a 5-minute timeout. For long meetings, the viewer shows live progress.\n\nPre-flight context: The server automatically gathers relevant source files from the topic and injects them into agent prompts. To hint specific files, include them in the topic: "API caching strategy [lib/cache.ts, app/api/route.ts]".\n\nOutcomes: Agent responses are parsed for [DECISION], [ACTION], and [OPEN:slug] tags. If no tags found in 2+ round meetings, AI extraction is attempted. Outcomes appear in the meeting file and are returned in the response.',
  {
    topic: z.string().describe('The question or topic for agents to discuss'),
    agents: z.array(z.enum(['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager']))
      .min(2).max(6)
      .describe('Which agents to consult (2-6 agents)'),
    rounds: z.number().min(1).max(3).optional()
      .describe('Number of deliberation rounds (1-3, default: 1). Use 2 for decisions that benefit from cross-agent synthesis. Use 3 only for complex/irreversible decisions.'),
    type: z.enum(['standup', 'design-review', 'strategy', 'architecture', 'sprint-planning', 'retrospective', 'incident-review', 'direction-check'])
      .optional()
      .describe('Meeting type for the generated file (default: direction-check)'),
    codeAware: z.boolean().optional()
      .describe('When true, agents can read the project codebase. Slower but more grounded. Default: false.'),
    writeMeeting: z.boolean().optional()
      .describe('Write results to a meeting file (default: true). Set false to get responses only.'),
  },
  async ({ topic, agents, rounds = 1, type = 'direction-check', codeAware = false, writeMeeting = true }) => {
    try {
      // Use async mode: returns a jobId immediately, meeting runs in background
      const result = await councilRequest('/api/council/multi-consult', 'POST', {
        topic, agents, rounds, type, codeAware, writeMeeting, async: true,
      }, 1, 15000); // Short timeout — async mode returns immediately

      if (result.error) {
        return { content: [{ type: 'text', text: `Multi-consult failed: ${result.error}` }], isError: true };
      }

      if (result.jobId) {
        return {
          content: [{
            type: 'text',
            text: `Meeting started in background.\n\nJob ID: ${result.jobId}\n\nThe meeting is running with ${agents.length} agents for ${rounds} round(s). The viewer will show live progress.\n\nTo check results: use council_job_status with jobId "${result.jobId}"`,
          }],
        };
      }

      // Fallback: if server returned synchronous result (shouldn't happen with async: true)
      return formatMeetingResult(result);
    } catch (err) {
      return { content: [{ type: 'text', text: `Multi-consult error: ${err.message}` }], isError: true };
    }
  }
);

/**
 * Format a synchronous meeting result for display.
 */
function formatMeetingResult(result) {
  const parts = [];
  if (result.meetingFile) {
    parts.push(`Meeting file: ${result.meetingFile}\n`);
  }
  const roundsData = result.rounds || [];
  for (const roundData of roundsData) {
    if (roundsData.length > 1) {
      parts.push(`## Round ${roundData.round}\n`);
    }
    for (const r of (roundData.responses || [])) {
      const displayName = r.agent.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      parts.push(`### ${displayName}\n\n${r.answer}`);
    }
  }
  if (result.outcomes) {
    const outcomeParts = ['\n## Outcomes\n'];
    if (result.outcomes.decisions?.length) {
      outcomeParts.push('**Decisions:**');
      for (const d of result.outcomes.decisions) {
        outcomeParts.push(`- [DECISION] ${d.text}${d.rationale ? `\n  Rationale: ${d.rationale}` : ''}`);
      }
      outcomeParts.push('');
    }
    if (result.outcomes.actions?.length) {
      outcomeParts.push('**Actions:**');
      for (const a of result.outcomes.actions) {
        outcomeParts.push(`- [ACTION] ${a.text}${a.assignee ? ` — ${a.assignee}` : ''}`);
      }
      outcomeParts.push('');
    }
    if (result.outcomes.openQuestions?.length) {
      outcomeParts.push('**Open Questions:**');
      for (const o of result.outcomes.openQuestions) {
        outcomeParts.push(`- [OPEN${o.slug ? ':' + o.slug : ''}] ${o.text}`);
      }
      outcomeParts.push('');
    }
    parts.push(outcomeParts.join('\n'));
  }
  return {
    content: [{ type: 'text', text: parts.join('\n\n---\n\n') }],
  };
}

// Tool: Check async job status
safeTool(
  'council_job_status',
  'Check the status of an async meeting job started by council_multi_consult. Returns the current status (pending/running/complete/failed), progress updates during execution, and the full meeting results when complete. Poll this after starting a meeting to get results.',
  {
    jobId: z.string().describe('The job ID returned by council_multi_consult'),
  },
  async ({ jobId }) => {
    try {
      const result = await councilRequest(`/api/council/job-status/${encodeURIComponent(jobId)}`);
      if (result.error) {
        return { content: [{ type: 'text', text: `Job error: ${result.error}` }], isError: true };
      }

      if (result.status === 'complete') {
        const elapsed = result.elapsed ? ` (${Math.round(result.elapsed / 1000)}s)` : '';
        // Format the full meeting result
        const formatted = formatMeetingResult(result.result || {});
        return {
          content: [{
            type: 'text',
            text: `Meeting complete${elapsed}.\n\n${formatted.content[0].text}`,
          }],
        };
      }

      if (result.status === 'failed') {
        const elapsed = result.elapsed ? ` after ${Math.round(result.elapsed / 1000)}s` : '';
        return {
          content: [{ type: 'text', text: `Meeting failed${elapsed}: ${result.error}` }],
          isError: true,
        };
      }

      // Still running
      const progress = result.progress ? ` — ${result.progress}` : '';
      return {
        content: [{
          type: 'text',
          text: `Job ${jobId}: ${result.status}${progress}\n\nThe meeting is still running. Call council_job_status again in 15-30 seconds to check progress.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Job status error: ${err.message}` }], isError: true };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
