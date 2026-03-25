# Agent Council

Run structured meetings between your Claude Code agents. Watch them deliberate in real time.

A meeting system — not just agent templates. A facilitator orchestrates rounds, mandatory roles prevent groupthink, a hub model lets agents read and respond to each other, and a live viewer shows it all in your browser. Works with both Claude Desktop and CLI.

## Quick Start

```bash
git clone https://github.com/cXplore/agent-council
cd agent-council
npm install
npm run dev
```

Open `http://localhost:3001` to see the landing page, or go straight to `/setup` to set up your agent team.

A sample meeting is included so you can see what meetings look like before connecting your own project.

## What You Get

### Agent Setup
Point it at your codebase. It detects your stack (languages, frameworks, structure) and suggests a team of agents. Customize roles and models, then generate `.claude/agents/*.md` files ready for Claude Code.

**12 agent templates:** facilitator, project-manager, critic, north-star, developer, architect, designer, qa-engineer, security-reviewer, devops, tech-writer, domain-expert

**3 team presets:** minimal (4 agents), standard (6 agents), full-stack (9 agents)

### Live Meeting Viewer
Watch agent meetings unfold in real time at `/meetings`. See each agent's response appear as it's written. Type into the meeting to add your own voice.

### The Meeting System
Every decision-producing meeting includes three mandatory roles:
- **project-manager** — what's real
- **critic** — what's wrong
- **north-star** — what's possible

**Round 1** — all agents respond independently, in parallel. No anchoring.

**Round 2+** — agents read the full conversation and respond sequentially. They engage with each other directly.

The meeting file is the hub. Everyone reads from it, everyone writes to it. You watch it build up live.

### 7 Meeting Formats
| Format | Trigger | Purpose |
|--------|---------|---------|
| Standup | "let's work" | Daily brief — where are we? |
| Design Review | "review the [component]" | Evaluate a specific design decision |
| Strategy Session | "strategy session on [topic]" | Direction and priorities |
| Retrospective | "retro on [work]" | What went well, what's messy |
| Architecture Review | "architecture review on [system]" | System design and trade-offs |
| Sprint Planning | "sprint planning" | What to tackle next |
| Incident Review | "incident review on [issue]" | What went wrong, how to prevent it |

## How to Run a Meeting

1. Start Agent Council: `npm run dev`
2. Open your project in Claude Code (Desktop app or CLI)
3. Say `let's work` for a standup, or `run a strategy session on [topic]`
4. Claude spawns the facilitator agent, which creates a meeting file and orchestrates the discussion
5. Watch it unfold live at `localhost:3001/meetings`
6. Type into the meeting from the viewer to add your own voice

## Multi-Project Support

Agent Council supports connecting multiple projects. Each project has its own agents and meetings.

- **Workspace mode** — agents and meetings live inside Agent Council itself (great for experimenting)
- **Connected projects** — point at any project with `.claude/agents/`. Agent Council reads their agents and meetings.

Switch between projects from the nav bar dropdown. Go to `/setup` to connect a new project or generate agents for one.

## Configuration

`council.config.json` (auto-created on first run):
```json
{
  "projects": {
    "my-app": {
      "path": "/path/to/my-app",
      "meetingsDir": "docs/meetings",
      "agentsDir": ".claude/agents"
    }
  },
  "activeProject": "workspace",
  "workspace": {
    "agentsDir": "./agents",
    "meetingsDir": "./meetings"
  },
  "port": 3001
}
```

## How It Works Under the Hood

The facilitator agent produces prompts *for* other agents — Claude Code (the orchestrator) dispatches them. The mechanical loop:

1. You trigger a meeting ("let's work", "strategy session on X")
2. Claude Code spawns the facilitator agent
3. The facilitator reads project context, selects participants, creates the meeting file
4. For Round 1: the facilitator produces prompts for each agent. Claude Code dispatches all in parallel.
5. Responses come back. The facilitator appends each to the meeting file (the hub).
6. For Round 2+: the facilitator picks speaking order. Each agent reads the full hub file, responds to what matters most. Dispatched one at a time, sequentially.
7. After each response, the facilitator appends it to the hub immediately — you see it appear in the viewer.
8. When the conversation converges (or after 3-5 rounds), the facilitator writes a summary and marks the meeting complete.

## Pages

| Page | Purpose |
|------|---------|
| `/` | Landing page with animated meeting demo |
| `/setup` | Connect a project or generate agents |
| `/meetings` | Live meeting viewer with 2s polling |
| `/agents` | Browse agents for the active project |
| `/guide` | Getting started walkthrough |

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript
- TailwindCSS v4
- No database, no auth — pure file I/O
- Works with Claude Code (Desktop and CLI)

## Contributing

Issues and PRs welcome. This project is built for the Claude Code community.

## License

MIT
