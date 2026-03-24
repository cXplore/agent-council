# Agent Council

A standalone developer tool for setting up Claude Code agent teams and running structured meetings between them with a live viewer.

## Stack

- Next.js (App Router, Turbopack)
- TypeScript
- TailwindCSS v4
- No database, no auth — pure file I/O

## Structure

```
app/                    # 4 pages: landing, setup wizard, meetings viewer, agents browser
  api/                  # REST endpoints for meetings, agents, setup (scan + generate)
lib/                    # Config, scanner, template engine, types
templates/              # Agent markdown templates + team presets
meetings/               # Where meeting files are stored (configurable)
```

## Key Concepts

- **Hub model**: The meeting file IS the shared conversation. All agents read/write to it.
- **Facilitator**: The engine — orchestrates rounds, controls speaking order, produces summaries.
- **Mandatory triad**: PM (what's real) + critic (what's wrong) + north-star (what's possible).
- **Round 1**: Parallel — agents respond independently. Round 2+: Sequential — agents read the hub and respond to each other.

## Configuration

`council.config.json` in project root:
```json
{
  "projectDir": ".",
  "meetingsDir": "./meetings",
  "agentsDir": ".claude/agents",
  "port": 3000
}
```

## File Quick Reference

| Purpose | File |
|---------|------|
| Meeting viewer | `app/meetings/MeetingViewer.tsx` |
| Meeting API | `app/api/meetings/route.ts` |
| Setup wizard | `app/setup/SetupWizard.tsx` |
| Codebase scanner | `lib/scanner.ts` |
| Template engine | `lib/agent-templates.ts` |
| Config loader | `lib/config.ts` |
| Agent templates | `templates/agents/*.md` |
| Team presets | `templates/presets/*.json` |
