# Agent Council

Run structured meetings between your Claude Code agents. Watch them deliberate in real time.

A meeting companion for Claude Code — a facilitator orchestrates rounds, mandatory roles prevent groupthink, and a live viewer shows it all as it happens.

## Get Started

### Desktop App
Download from [Releases](https://github.com/cXplore/agent-council/releases) and run. No terminal needed.

### From Source
```bash
git clone https://github.com/cXplore/agent-council
cd agent-council
npm install
npm run dev
# Opens at http://localhost:3003
```

### CLI
```bash
node bin/cli.js
# Starts server and opens browser
```

## How It Works

1. **Connect** — point Agent Council at your project via the Setup page (`/setup`)
2. **Meet** — in Claude Code, ask for a meeting: *"run a meeting about the API design"*, *"let's review the auth flow"*
3. **Watch** — agent responses appear live at `/meetings`. Type to add your own voice.

## The Meeting System

Every decision-producing meeting includes three mandatory roles:
- **project-manager** — what's real
- **critic** — what's wrong
- **north-star** — what's possible

**Round 1** — all agents respond independently, in parallel. No anchoring.
**Round 2+** — agents read the full conversation and respond sequentially.

The meeting file is the hub. Everyone reads from it, everyone writes to it.

### Meeting Formats
| Format | Purpose |
|--------|---------|
| Standup | Daily brief |
| Design Review | Evaluate a design decision |
| Strategy Session | Direction and priorities |
| Retrospective | What went well/messy |
| Architecture Review | System design and trade-offs |
| Sprint Planning | What to tackle next |
| Incident Review | What went wrong |

No special commands — just ask Claude Code for a meeting in plain language.

## MCP Integration

Agent Council includes an MCP server for two-way communication with Claude Code. The facilitator can notify the viewer of meeting progress and check for human input.

Add to your Claude config:

**Claude Code CLI** — `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "agent-council": {
      "command": "node",
      "args": ["/path/to/agent-council/mcp/server.mjs"]
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json` (in `%APPDATA%/Claude/` on Windows, `~/Library/Application Support/Claude/` on Mac):
```json
{
  "mcpServers": {
    "agent-council": {
      "command": "node",
      "args": ["/path/to/agent-council/mcp/server.mjs"]
    }
  }
}
```

## Agent Templates

**12 templates:** facilitator, project-manager, critic, north-star, developer, architect, designer, qa-engineer, security-reviewer, devops, tech-writer, domain-expert

**3 presets:** minimal (4 agents), standard (6 agents), full-stack (9 agents)

### Agent Frontmatter Standard

Agent `.md` files use YAML frontmatter. Agent Council reads these fields:

```yaml
---
name: presence-designer          # Display name
description: UX specialist...    # One-line summary
model: opus                      # Claude model
tools: Read, Grep, Write         # Tools the agent can use
required: false                  # true for mandatory triad members
team: design                     # Team grouping (optional)
role: lead                       # lead or member (optional)
---
```

The `team` and `role` fields are optional — Agent Council uses them to group agents visually. Common teams: `core` (PM, critic, north-star), `engineering`, `design`, `content`, `strategy`. Use whatever fits your project.

To update existing agents for Agent Council, tell Claude Code: *"Update all agents in .claude/agents/ to include team and role fields in their frontmatter, following the Agent Council frontmatter standard."*

## Configuration

`council.config.json` (auto-created, gitignored):
```json
{
  "projects": {
    "my-app": {
      "path": "/path/to/my-app",
      "meetingsDir": "meetings",
      "agentsDir": ".claude/agents"
    }
  },
  "activeProject": "my-app",
  "port": 3003
}
```

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript, TailwindCSS v4
- Electron (desktop builds)
- MCP server (Claude Code integration)
- No database, no auth — pure file I/O

## License

MIT
