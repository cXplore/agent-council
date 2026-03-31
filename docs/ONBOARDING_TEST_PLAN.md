# Onboarding Test Plan

> Run this checklist when connecting Agent Council to an unfamiliar project for the first time.
> The goal is to verify the full pipeline: scan → context → brief → intake meeting → useful outcomes.

## Prerequisites

- [ ] Test project is **not** TypeScript/Next.js (stress-test scanner diversity)
- [ ] Test project has a different folder structure from agent-council
- [ ] Test project is medium complexity (50-500 files, real structure)
- [ ] Agent Council dev server running at localhost:3003

## Phase 1: Connect & Scan

| # | Criterion | How to Verify | Pass/Fail |
|---|-----------|---------------|-----------|
| 1 | Scanner detects language correctly | Check console output or scan API response | |
| 2 | Scanner detects framework (if any) | Compare to project's actual framework | |
| 3 | `meetingsDir` created on disk | `ls {project}/meetings/` exists | |
| 4 | `.claude/agents/` dir created | `ls {project}/.claude/agents/` exists | |
| 5 | At least 1 agent context file written | Check `.claude/agents/*.context.md` | |
| 6 | Context file has project-specific content | Open file, verify it mentions actual tech stack | |
| 7 | `PROJECT_BRIEF.md` created in meetings dir | `ls {project}/meetings/PROJECT_BRIEF.md` | |
| 8 | Brief has auto-filled tech context | Open file, check Technical Context section | |

## Phase 2: Session Brief

| # | Criterion | How to Verify | Pass/Fail |
|---|-----------|---------------|-----------|
| 9 | Session brief shows project name + stack | Run `council_session_brief` | |
| 10 | Brief suggests intake meeting (zero meetings) | Check for "NEW PROJECT" line in output | |
| 11 | Suggested command is copy-pasteable | Verify the multi_consult command is valid | |

## Phase 3: Intake Meeting

| # | Criterion | How to Verify | Pass/Fail |
|---|-----------|---------------|-----------|
| 12 | Meeting file created within 2 seconds | Check viewer or file system | |
| 13 | "Meeting starting..." visible before agents speak | Open file immediately after creation | |
| 14 | Agents reference project-specific tech | Read agent responses for actual project details | |
| 15 | At least 1 DECISION tagged in outcomes | Check meeting file for [DECISION] tags | |
| 16 | At least 1 ACTION tagged with verifiable "done when" | Check meeting file for [ACTION] tags | |
| 17 | Decisions are project-specific, not generic advice | Would these decisions apply to ANY project? If yes, fail | |

## Phase 4: Viewer Experience

| # | Criterion | How to Verify | Pass/Fail |
|---|-----------|---------------|-----------|
| 18 | Meeting appears in viewer meeting list | Browse to localhost:3003 | |
| 19 | Completion card shows outcome counts | Click completed meeting | |
| 20 | Activity feed shows the meeting | Check activity feed for new entry | |

## Results

**Date tested:**
**Project used:**
**Overall pass rate:** ___ / 20

### Failures & Root Causes

| # | What failed | Root cause | Fix needed |
|---|-------------|------------|------------|
| | | | |

### Key Findings

1.
2.
3.
