# Agent Council

A companion app for Claude Code agent meetings. Connects to your projects, watches meeting files live, and provides an agent browser.

## Stack

- Next.js 16 (App Router)
- TypeScript
- TailwindCSS v4
- Electron (desktop app)
- MCP server (Claude Code integration)
- No database, no auth — pure file I/O

## Structure

```
app/                    # Pages: meetings viewer, agents browser, setup wizard, guide
  api/                  # REST: meetings, agents, projects, setup, council (MCP bridge)
  components/           # Nav with project switcher
lib/                    # Config, scanner, template engine, types, markdown components
templates/              # Agent markdown templates + team presets
electron/               # Electron main process (desktop app)
mcp/                    # MCP server for Claude Code integration
bin/                    # CLI entry point
meetings/               # Where meeting files are stored (configurable)
docs/                   # GitHub Pages static site
```

## Key Concepts

- **Hub model**: The meeting file IS the shared conversation. All agents read/write to it.
- **Facilitator**: The engine — orchestrates rounds, controls speaking order, produces summaries.
- **Mandatory triad**: PM (what's real) + critic (what's wrong) + north-star (what's possible).
- **Round 1**: Parallel — agents respond independently. Round 2+: Sequential — agents read the hub and respond to each other.
- **MCP integration**: Optional — facilitator can notify the viewer of progress and check for human input.

## Configuration

`council.config.json` in project root (auto-created, gitignored):
```json
{
  "projects": {
    "my-project": {
      "path": "C:/Projects/my-project",
      "meetingsDir": "meetings",
      "agentsDir": ".claude/agents"
    }
  },
  "activeProject": "my-project",
  "workspace": {
    "agentsDir": "./agents",
    "meetingsDir": "./meetings"
  },
  "port": 3003
}
```

## Entry Points

| Method | Command | Audience |
|--------|---------|----------|
| Dev server | `npm run dev` | Developers |
| Desktop app | `npm run dist:win` then run `.exe` | End users |
| CLI | `node bin/cli.js` | Terminal users |
| Electron dev | `npm run electron:dev` | Electron development |

## File Quick Reference

| Purpose | File |
|---------|------|
| Meeting viewer | `app/meetings/MeetingViewer.tsx` |
| Meeting API | `app/api/meetings/route.ts` |
| Agents page | `app/agents/page.tsx` |
| Agents API | `app/api/agents/route.ts` |
| Projects API | `app/api/projects/route.ts` |
| Nav + project switcher | `app/components/Nav.tsx` |
| Setup wizard | `app/setup/SetupWizard.tsx` |
| Config loader | `lib/config.ts` |
| Codebase scanner | `lib/scanner.ts` |
| Template engine | `lib/agent-templates.ts` |
| Markdown components | `lib/md-components.tsx` |
| MCP server | `mcp/server.mjs` |
| Electron main | `electron/main.js` |
| CLI | `bin/cli.js` |
| Meeting list card | `app/meetings/MeetingListCard.tsx` |
| Meeting outcomes panel | `app/meetings/MeetingOutcomes.tsx` |
| Meeting completion card | `app/meetings/MeetingCompletionCard.tsx` |
| Dashboard | `app/dashboard/page.tsx` |
| Analytics API | `app/api/meetings/analytics/route.ts` |
| Export API | `app/api/meetings/export/route.ts` |
| Validation API | `app/api/meetings/validate/route.ts` |
| Templates API | `app/api/setup/templates/route.ts` |
| Tag index | `lib/tag-index.ts` |
| Meeting utils | `lib/meeting-utils.ts` |
| Error boundary | `app/components/ErrorBoundary.tsx` |
| Command palette | `app/components/CommandPalette.tsx` |
| Toast notifications | `app/components/Toast.tsx` |
| Settings page | `app/settings/page.tsx` |
| 404 page | `app/not-found.tsx` |
| Health check API | `app/api/health/route.ts` |
| RSS feed API | `app/api/meetings/feed/route.ts` |
| Key terms API | `app/api/meetings/terms/route.ts` |
| Meeting template API | `app/api/meetings/template/route.ts` |
| Agent templates | `templates/agents/*.md` |
| Team presets | `templates/presets/*.json` |
| GitHub Pages | `docs/index.html` |


## Meeting System (Agent Council)

This project uses Agent Council for structured agent meetings. When the user asks for any kind of meeting, discussion, review, or standup, use the **facilitator** agent to orchestrate it.

### How to Run a Meeting

1. The user asks for a meeting in plain language (no special commands needed)
2. Spawn the facilitator agent, which creates a meeting file and orchestrates the conversation
3. The user watches it live at the Agent Council meeting viewer

### Meeting Formats

The facilitator picks the right format based on what the user asks for:

- **Standup** — daily brief, what matters today
- **Design Review** — evaluate a specific component or design decision
- **Strategy Session** — direction and priorities on a topic
- **Retrospective** — what went well, what's messy
- **Architecture Review** — system design and trade-offs
- **Sprint Planning** — what to tackle next
- **Incident Review** — what went wrong, how to prevent it

### Mandatory Roles

Every decision-producing meeting includes: **project-manager** (what's real), **critic** (what's wrong), **north-star** (what's possible).

### Operating Protocol (from 5-meeting validation experiment)

Meetings are a thinking tool for complex decisions. The default is no meeting.

**When to meet:**
- Before 4+ hours of new work → Direction Check (Tier 0: 1 round, 2 agents)
- Reversible decision? → Quick Consult (Tier 1: 1 round, 3 agents)
- Irreversible or system-wide? → Full Meeting (Tier 2: 2-3 rounds, 4-5 agents)
- Otherwise: no meeting. Code.

**Rules:** Max 2 full meetings/week. JSON appendix required for Tier 2. Agents read actual source files for technical meetings. Open questions archived after 3 meetings without progress.
