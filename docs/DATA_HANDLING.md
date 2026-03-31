# Agent Council — Data Handling

## Where Data Lives

| Data Type | Location | Format |
|-----------|----------|--------|
| Meeting transcripts | `<project>/meetings/*.md` | Markdown files |
| Agent definitions | `<project>/.claude/agents/*.md` | Markdown with frontmatter |
| Agent context files | `<project>/.claude/agents/*.context.md` | Markdown, rolling 50-entry window |
| Project brief | `<project>/.claude/agents/PROJECT_BRIEF.md` | Markdown template |
| Activity log | `<project>/meetings/activity.log` | JSONL (one JSON object per line) |
| Config | `<project>/council.config.json` | JSON |
| Worker state | `<project>/.council-worker-state.json` | JSON |
| Worker log | `<project>/.council-worker-log.md` | Markdown (50-entry cap) |
| Tag index | In-memory, rebuilt on demand | Parsed from meeting files |

## Access Model

- **All data is local.** Nothing is sent to external services except LLM API calls.
- **LLM API calls** send meeting topics, agent prompts, and (when `codeAware=true`) excerpts of source files to the configured LLM provider (Anthropic API or via Claude Code's Agent SDK).
- **No database.** All persistence is file I/O to the project directory.
- **No authentication.** The app runs locally on `localhost:3003`. Anyone with local network access to that port can read/write data.
- **No telemetry.** No usage data is collected or transmitted.

## What the LLM Sees

When a meeting runs, the LLM receives:
1. **Agent system prompt** — role description, project conventions
2. **Meeting topic** — the user's question or discussion topic
3. **Pre-flight context** — recent decisions, open questions, stale actions from past meetings
4. **Project brief** — user-editable project description (if filled in)
5. **Source files** (codeAware only) — excerpts of project files selected by keyword relevance, truncated to fit token budget

The LLM does NOT receive:
- Full meeting transcripts from past meetings (only tagged outcomes)
- User credentials or API keys (except the LLM API key itself)
- File system paths outside the project directory
- Git history or commit messages

## Retention

- **Meeting files** persist indefinitely until manually deleted.
- **Context file learnings** are capped at 50 entries per agent. Entries older than 30 days are auto-pruned when new entries are added.
- **Corrections** persist until manually removed (max 20 per agent).
- **Activity log** entries are deduplicated on write. No automatic pruning.
- **Worker log** is trimmed to the most recent ~50 entries per run.

## Scope Boundaries

- Agent Council only reads/writes within the configured project directory.
- The MCP server (when used via Claude Code) proxies all operations through HTTP to `localhost:3003` — it performs no direct file I/O.
- Claude Code sessions have their own scope. Agent Council does not expand or modify Claude Code's access.
