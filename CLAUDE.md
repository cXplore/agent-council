# Agent Council

A companion app for Claude Code agent meetings. Connects to your projects, watches meeting files live, and provides an agent browser.

## Stack

- Next.js 16 (App Router, Turbopack)
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
| Agent templates | `templates/agents/*.md` |
| Team presets | `templates/presets/*.json` |
| GitHub Pages | `docs/index.html` |
