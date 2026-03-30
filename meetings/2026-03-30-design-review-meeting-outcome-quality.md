---
title: "Design Review: Are Meeting Outcomes Actually Useful?"
type: design-review
status: complete
date: 2026-03-30
participants: [project-manager, critic, north-star]
---

# Design Review: Are Meeting Outcomes Actually Useful?

## Context

We recently fixed the structured outcomes pipeline (`formatOutcomesAppendix` → JSON appendix → `extractFromJSON` → tag index). The flow now works end-to-end. But the deeper question is: **does the current outcome format actually produce useful decisions?**

Looking at the last 20 meetings' outcomes, we see patterns:
- Many decisions are procedural ("defer X", "remove Y", "don't build Z")
- Action items often repeat across meetings without progress
- Open questions linger — the staleness system archives them after 3 meetings, but that's avoidance, not resolution
- The `council_session_brief` surfaces recent decisions, but do those decisions actually change behavior?

### What the outcomes pipeline looks like today

1. Facilitator tags inline: `[DECISION]`, `[ACTION]`, `[OPEN:slug]`
2. `council_close_meeting` accepts structured `outcomes` parameter
3. `formatOutcomesAppendix` writes a JSON appendix with schema_version, decisions, actions, open_questions
4. `tag-index.ts` extracts both inline tags and JSON appendix
5. `council_session_brief` and `council_get_work_items` surface them to sessions

### Questions for this review

1. Are the three tag types (DECISION, ACTION, OPEN) the right categories?
2. Is the current format producing outcomes that actually get acted on?
3. What would make outcomes more actionable?
4. Should outcomes link back to code changes or commits?

---

## Round 1: Independent Assessment

### Project Manager

Looking at hard data from the 20 meetings in this project:

**Tag distribution:**
- Decisions: ~60-70 per meeting across the corpus, but many are "don't do X" or "defer Y" — negative decisions that don't require action
- Actions: ~40-50 total, but the staleness system marks most as stale after 3 meetings. In practice, only actions from the most recent 2-3 meetings get worked on
- Open questions: ~20-30 total, same staleness pattern

**What actually gets acted on:**
The autonomous worker (`council-autonomous-work`) is the primary consumer of outcomes. It calls `council_get_work_items` and picks up ACTION items. Looking at the work log, the worker successfully completed actions like:
- "Add bootstrap protocol to facilitator template" (from strategy meeting)
- "Remove activity logging" (from direction check)
- "Improve council_session_brief empty-state" (from direction check)

These worked because they were **specific, scoped, and immediately implementable**. Actions that languish are vague: "test on a real project", "explore whether X would help".

**The real gap:** Decisions are recorded but not enforced. We decided "no more meta-improvements until friction reveals gaps" — but the worker kept running meetings and building features. The decision was correct but had no mechanism to influence behavior.

[OBSERVATION] The outcome format captures what was decided, but not the enforcement mechanism. A decision without a way to check compliance is a suggestion.

### Critic

Three problems with the current system:

**1. Category confusion.** The line between DECISION and ACTION is blurry. "Remove activity logging" — is that a decision (we decided to remove it) or an action (someone needs to do the removal)? Currently it appears as both, which inflates the count and creates noise. The three categories are necessary but the facilitator needs clearer guidance on when something is a decision vs. an action.

**2. Outcome quality varies wildly with facilitator prompting.** When the facilitator template explicitly instructs "tag all decisions and actions," outcomes are structured. When the meeting flows organically, tags get forgotten or applied inconsistently. The JSON appendix via `council_close_meeting` was supposed to fix this, but it depends on the facilitator actually summarizing correctly at the end.

**3. No feedback loop.** An outcome is written once and never revised. If an action turns out to be wrong, it just goes stale. If a decision needs revisiting, there's no mechanism — you'd need to run another meeting. The system is write-once, which means outcomes accumulate without quality control.

What would fix each:
1. Add explicit guidance in the facilitator template: "A DECISION is a choice that constrains future behavior. An ACTION is a concrete task with a clear done state."
2. Make the JSON appendix required, not optional. The facilitator should always use `council_close_meeting` with structured outcomes.
3. Add a `council_revise_outcome` tool or a simpler mechanism — allow marking a decision as "superseded by" a newer one.

[CONCERN] The biggest risk is outcome inflation — 60+ decisions from 20 meetings means any consumer has to filter aggressively. The staleness system helps but is a bandaid. Better to produce fewer, higher-quality outcomes.

### North Star

The current system captures decisions, but **decisions aren't the most valuable output of a meeting.** The most valuable output is shared understanding — the reasoning behind decisions, the trade-offs considered, the dissenting views that were weighed.

Right now, a decision like "Remove activity logging" captures the what but loses the why. The rationale (checkpoint showed 0 entries, nothing reads it) is in the meeting prose but not in the structured outcome. When the autonomous worker picks up that action, it has no context for why. It just executes.

**What would make outcomes transformative:**

1. **Rationale field.** Every decision should carry a one-line "because" — not just what was decided, but why. This already exists in the JSON appendix schema (`rationale` field) but is rarely populated. Make it required.

2. **Outcome chains.** Decisions should reference what they supersede. "Remove activity logging" supersedes the earlier "Add capped activity logging." Without chains, the history looks contradictory.

3. **Impact tracking.** After an action is marked done, record what changed. "Removed 40 lines from server.mjs, 235→235 tests." This turns outcomes into a project changelog that's richer than git log.

4. **The real vision:** Outcomes become the project's institutional memory. Not just "what did we decide" but "what do we know." A new contributor reads the outcome index and understands not just the current state but the reasoning path that got here.

[OBSERVATION] The structured outcomes pipeline is infrastructure. The question isn't whether the plumbing works (it does now) — it's whether we're putting the right things through the pipes.

---

## Round 2: Response and Synthesis

### Project Manager

Responding to both:

The critic's category confusion point is real. I can quantify it: roughly 30% of items appear as both DECISION and ACTION in the same meeting. The fix is straightforward — update the facilitator template with clear definitions. I agree with the proposed language.

The north-star's rationale field point is already partially implemented. The JSON schema has `rationale` as an optional field. The problem is that `formatOutcomesAppendix` doesn't surface it prominently, and the `council_session_brief` drops it entirely to save tokens. We could:
1. Make `rationale` required in the facilitator template instructions
2. Show rationale in `council_get_work_items` (where the worker reads actions)
3. Keep it hidden in `council_session_brief` (which needs to be concise)

The outcome chains idea is interesting but adds complexity. A simpler version: when a decision contradicts an earlier one, the facilitator notes "supersedes [previous decision text]" in the rationale field. No new schema needed.

Impact tracking is valuable but should be a `council_mark_done` enhancement — when marking an action done, the `note` parameter (which already exists) should be encouraged for recording what changed.

**Concrete actions I'd recommend:**
1. Update facilitator template with DECISION vs ACTION definitions
2. Make rationale a strongly-encouraged field in facilitator instructions
3. Encourage `note` usage in `council_mark_done` for impact tracking

[DECISION] Update facilitator template to clearly distinguish DECISION (constrains future behavior) from ACTION (concrete task with done state). Include examples.

[DECISION] Make rationale a strongly-encouraged field in structured outcomes. Not required (to avoid blocking close-meeting flow) but prompted by the facilitator template.

### Critic

The PM's response is practical and I agree with the concrete actions. But I want to push back on one thing: adding more instructions to the facilitator template is necessary but not sufficient.

The real enforcement mechanism is the `council_close_meeting` tool. Right now it accepts outcomes as an optional parameter. The facilitator can close a meeting without any structured outcomes at all. If we want quality, the tool should at minimum warn when outcomes are empty.

However — I don't want to block meeting closure. Meetings can legitimately produce no decisions (pure information sharing). So the fix is: `council_close_meeting` should log a warning to the meeting file itself when outcomes are empty: "Note: No structured outcomes recorded for this meeting."

This creates social pressure (visible in the meeting file) without blocking the flow.

On outcome inflation: the staleness system is doing the right job. 193 done, 38 archived from the work items query — that's healthy. The active surface is small (0 actions, 1 open question). The accumulation isn't a problem as long as the filter works. And it does.

[DECISION] Keep the current three-category system (DECISION, ACTION, OPEN). The categories are correct; the issue is definitional clarity, not category design.

### North Star

I'm satisfied with the practical direction. The PM's proposal to use the existing `rationale` field and `note` parameter is better than building new infrastructure — it's using what we have more effectively.

One addition: the facilitator template should include a "quality check" step before closing. Something like: "Before closing, verify each outcome: Can a reader understand WHY this was decided without reading the full transcript? Is each ACTION specific enough that someone could start working on it immediately?"

This is a prompt engineering improvement, not a code change. But it's the highest-leverage thing we can do because it improves every future meeting.

[DECISION] Add an outcome quality check step to the facilitator template: verify rationale is present and actions are immediately actionable before closing.

[ACTION] Update the facilitator template with: (1) DECISION vs ACTION definitions, (2) rationale encouragement, (3) pre-close quality check step.

---

## Summary

This review evaluated whether the meeting outcomes system produces useful, actionable results. The structured pipeline works technically (after recent fixes), but outcome quality depends on facilitator discipline.

**Key findings:**
- The three categories (DECISION, ACTION, OPEN) are correct but need clearer definitions
- Outcomes that get acted on are specific and immediately implementable; vague outcomes languish
- The `rationale` field exists but is underused
- The `council_mark_done` note parameter exists but isn't encouraged for impact tracking

**Changes agreed:**
1. Update facilitator template with clear DECISION vs ACTION definitions + examples
2. Add rationale encouragement to the facilitator's outcome-writing instructions
3. Add a pre-close quality check step to the facilitator template
4. Encourage `note` usage in `council_mark_done` for recording what changed
