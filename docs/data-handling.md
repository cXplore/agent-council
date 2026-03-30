# Agent Council — Data Handling

How Agent Council stores, accesses, and scopes data.

## Where data lives

| Data | Location | Scope |
|------|----------|-------|
| Meeting transcripts | `{projectPath}/{meetingsDir}/` (default: `meetings/`) | Per-project directory, gitignored by default |
| Agent definitions | `{projectPath}/.claude/agents/*.md` | Per-project, managed via HTTP API |
| Agent context files | `{projectPath}/.claude/agents/*.context.md` | Per-project, rolling 50-line window |
| Configuration | `council.config.json` in Agent Council root | Cross-project (lists connected projects) |
| Tag index | Computed at runtime from meeting files | Per-project, never persisted to disk |

## What agents can see

- **Meeting files**: Full text of all meetings in the active project's meetings directory.
- **Agent context files**: Per-agent learnings accumulated from past meetings (50-line rolling window with 20-entry corrections section).
- **ProjectProfile**: Filesystem scan results — languages, frameworks, structure, libraries, coverage boundaries. Stored in `council.config.json` per project.
- **Project files** (optional): When `codeAware` mode is enabled on `quick_consult` or `ai_context`, agents get Read/Glob/Grep tools scoped to the project directory.

## What agents cannot see

- Other projects' meetings or agents (strict project isolation).
- Environment variables, secrets, or `.env` files.
- Git history or diffs (not scanned — flagged in coverage boundaries as "unknown").
- Files inside `node_modules`, `.git`, `dist`, `build`, or other skipped directories.
- Network requests, runtime logs, or database contents.
- Other users' Claude Code sessions.

## Claude Code session scope

Agent Council runs as an MCP server within a single Claude Code session:

- The MCP server process has filesystem access to connected project paths.
- Meeting files are plain markdown — no encryption, no access control.
- The OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) authenticates SDK API calls and is stored in `.env.local` (gitignored).
- Each Claude Code session is isolated — there is no shared state between different users' sessions.
- The autonomous worker (scheduled task) runs in its own Claude Code session with the same access scope.

## What is NOT additionally exposed

- Agent Council does not send meeting content to any external service.
- Agent Council does not persist data beyond the filesystem (no database, no cloud storage).
- Agent Council does not create network connections beyond the Claude API (via SDK) and the local dev server (port 3003).
- Meeting files are not indexed by search engines (they live in gitignored local directories).
- The MCP server exposes read/write tools only to the connected Claude Code session — it does not listen on a network port accessible to other processes.
