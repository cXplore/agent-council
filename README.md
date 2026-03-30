# Agent Council

Your Claude Code agents can have meetings. You watch them argue.

Tell Claude Code *"let's review the dark mode design"* and a facilitator spins up a design review with a project manager, designer, critic, and developer. They deliberate in rounds — first independently (no groupthink), then building on each other's points. A mandatory critic catches what everyone else missed. You watch it live and jump in between rounds.

No database. No auth. Pure file I/O — the meeting file IS the conversation.


## Quick Start

```bash
git clone https://github.com/cXplore/agent-council
cd agent-council
npm install
npm run dev
# Opens at http://localhost:3003 → connect your project → ask Claude for a meeting
```

Or download the [desktop app](https://github.com/cXplore/agent-council/releases) (no terminal needed).

## How It Works

1. **Connect** — point Agent Council at your project. It scans your stack and generates a team of specialized agents.
2. **Meet** — in Claude Code, just ask: *"run a design review on the auth flow"*, *"what should we work on today?"*
3. **Watch** — agent responses stream live at `/meetings`. Type between rounds to steer the conversation.
4. **Track** — decisions, actions, and open questions are tagged and tracked across meetings on the roadmap.

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

### Agent Frontmatter

Agent `.md` files use YAML frontmatter. The standard fields work with or without Agent Council:

```yaml
---
name: presence-designer          # Display name
description: UX specialist...    # One-line summary
model: opus                      # Claude model
tools: Read, Grep, Write         # Tools the agent can use
required: false                  # true for mandatory triad members

# Agent Council (remove if not using Council)
team: design                     # Team grouping
role: lead                       # lead or member
---
```

The `team` and `role` fields are Agent Council extensions — they control how agents are grouped in the viewer. If you stop using Council, just delete those two lines. Common teams: `core`, `engineering`, `design`, `content`, `strategy`.

To add Council fields to existing agents, tell Claude Code: *"Add Agent Council team and role fields to all agents in .claude/agents/. Use a comment separator. Teams: core, design, content, engineering, strategy."*

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
  "workspace": {
    "agentsDir": "./agents",
    "meetingsDir": "./meetings"
  },
  "port": 3003
}
```

## What You Get

**Live viewer** — agent responses stream in real time. Control pacing: auto, guided (click to proceed), or manual. Join the conversation between rounds.

**Roadmap** — every `[DECISION]`, `[ACTION]`, and `[OPEN]` tag across all meetings is tracked. Mark items done, stale, or working. Staleness detection flags planned meetings overtaken by completed work.

**Agent browser** — view, create, and configure agents with team grouping. Smart template merge keeps agents updated without losing your model and team settings.

**MCP integration** — 15 tools for two-way communication. Claude gets a session brief at startup, sees your roadmap nudges, and picks up planned meetings automatically.

**Everything else** — keyboard shortcuts (j/k, Ctrl+K, Ctrl+F), export (HTML/JSON/markdown/RSS), dashboard analytics, CLI flags, Electron desktop app, print CSS, accessibility.

## Tech Stack

Next.js 16 (App Router), TypeScript, TailwindCSS v4, Electron, MCP server. No database, no auth — pure file I/O.

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/meetings` | List, create, delete meetings |
| `/api/meetings/analytics` | Aggregate meeting statistics |
| `/api/meetings/export` | JSON bundle export |
| `/api/meetings/feed` | RSS feed |
| `/api/meetings/tags` | Cross-meeting tag queries |
| `/api/meetings/terms` | Key terms extraction |
| `/api/meetings/validate` | Meeting file validation |
| `/api/meetings/template` | Meeting file template generator |
| `/api/agents` | List and update agents |
| `/api/projects` | Manage connected projects |
| `/api/council/*` | MCP bridge (events, input, planned, suggestions) |
| `/api/setup/*` | Setup wizard (scan, connect, generate, templates, mcp) |
| `/api/health` | Application health check |

## License

MIT
