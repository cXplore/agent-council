#!/usr/bin/env node

/**
 * Agent Council MCP Server
 *
 * Connects Claude Code to Agent Council. The facilitator agent can:
 * - Check if someone is watching in the viewer
 * - Send meeting progress updates
 * - Check for human input from the viewer
 *
 * Usage: Add to your project's .claude/settings.json:
 * {
 *   "mcpServers": {
 *     "agent-council": {
 *       "command": "node",
 *       "args": ["path/to/agent-council/mcp/server.js"]
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

// Helper to make HTTP requests to Agent Council
function councilRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
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
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Agent Council not reachable at ${COUNCIL_URL}: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to Agent Council timed out`));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
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
      const data = await councilRequest('/api/projects');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            running: true,
            activeProject: data.activeProject,
            projectCount: data.projects?.length || 0,
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
