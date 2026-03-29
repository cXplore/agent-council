import { describe, it, expect } from 'vitest';
import {
  parseMetadata,
  titleFromFilename,
  validateMeeting,
  extractSummary,
  getContentForRound,
  extractAgents,
} from '@/lib/meeting-utils';

// ---------------------------------------------------------------------------
// Realistic meeting content used across multiple test groups
// ---------------------------------------------------------------------------

const FULL_MEETING = `<!-- meeting-type: design-review -->
<!-- status: complete -->
<!-- created: 2026-03-28 14:30 -->
<!-- participants: project-manager, critic, north-star, developer -->

# Design Review — API Authentication

## Context

We need to decide on an authentication strategy for the new API layer.

## Round 1

**project-manager:** We have three options on the table: JWT, session cookies, or API keys. JWT is the industry default for SPAs.

**critic:** JWT has well-known pitfalls — token revocation is non-trivial and payload size grows with claims.

**north-star:** Whatever we pick, it should support multi-tenant isolation from day one.

**developer:** JWT is straightforward to implement. I can have a working prototype in 2 hours using jose.

## Round 2

**project-manager:** Based on round 1, JWT with short-lived access tokens and refresh tokens seems like the consensus.

**critic:** Agreed, as long as we set a hard 15-minute expiry on access tokens and store refresh tokens server-side.

**north-star:** Add a tenant claim to the JWT payload so downstream services can enforce isolation without extra lookups.

**developer:** I'll wire up the middleware. Estimated 3 hours including tests.

## Summary

- [DECISION] Use JWT with 15-minute access tokens and server-side refresh tokens
- [ACTION] Build authentication middleware — assigned to developer
- [OPEN:token-rotation] Should we implement automatic token rotation on each refresh?

### Recommended Next Meetings

- Architecture Review — Token storage and rotation strategy
- Sprint Planning: Authentication middleware implementation
`;

const BOLD_FORMAT_MEETING = `# Standup — Sprint 12

**Type:** Standup
**Date:** 2026-03-29
**Participants:** project-manager, developer, critic

## Round 1

**project-manager:** Yesterday I finished the roadmap page. Today I'm reviewing PRs.

**developer:** I shipped the agent browser and fixed a CSS regression.

**critic:** The test coverage dropped 3% this sprint. We should address that before release.
`;

// ---------------------------------------------------------------------------
// parseMetadata
// ---------------------------------------------------------------------------

describe('parseMetadata', () => {
  it('extracts metadata from HTML comment format', () => {
    const meta = parseMetadata(FULL_MEETING);
    expect(meta.status).toBe('complete');
    expect(meta.type).toBe('design-review');
    expect(meta.title).toBe('Design Review — API Authentication');
    expect(meta.started).toBe('2026-03-28 14:30');
    expect(meta.participants).toEqual(['project-manager', 'critic', 'north-star', 'developer']);
  });

  it('extracts metadata from bold format', () => {
    const meta = parseMetadata(BOLD_FORMAT_MEETING);
    expect(meta.type).toBe('standup');
    expect(meta.started).toBe('2026-03-29');
    expect(meta.participants).toEqual(['project-manager', 'developer', 'critic']);
  });

  it('infers type from title when no explicit type metadata exists', () => {
    const content = `# Architecture Review — Data Layer

## Round 1

**architect:** We should use a repository pattern.
`;
    const meta = parseMetadata(content);
    expect(meta.type).toBe('architecture-review');
  });

  it('falls back to in-progress when no status comment and no summary', () => {
    const content = `# Quick Chat

**developer:** Let's discuss the bug.
`;
    const meta = parseMetadata(content);
    expect(meta.status).toBe('in-progress');
  });

  it('infers complete status when summary section exists but no status comment', () => {
    const content = `# Design Review

## Round 1

**critic:** Looks good.

## Summary

- [DECISION] Ship it
`;
    const meta = parseMetadata(content);
    expect(meta.status).toBe('complete');
  });

  it('discovers agents as participants when no explicit participants metadata', () => {
    const content = `# Quick Consult

## Round 1

**architect:** The pattern looks clean.

**developer:** I can implement this in an hour.
`;
    const meta = parseMetadata(content);
    expect(meta.participants).toContain('architect');
    expect(meta.participants).toContain('developer');
    expect(meta.participants).not.toContain('type');
  });

  it('returns empty recommendedMeetings when none exist', () => {
    const meta = parseMetadata(BOLD_FORMAT_MEETING);
    expect(meta.recommendedMeetings).toEqual([]);
  });

  it('parses recommended next meetings', () => {
    const meta = parseMetadata(FULL_MEETING);
    expect(meta.recommendedMeetings).toHaveLength(2);
    expect(meta.recommendedMeetings[0].type).toBe('architecture-review');
    expect(meta.recommendedMeetings[0].topic).toBe('Token storage and rotation strategy');
    expect(meta.recommendedMeetings[1].type).toBe('sprint-planning');
  });

  it('handles completely empty content', () => {
    const meta = parseMetadata('');
    expect(meta.status).toBe('in-progress');
    expect(meta.type).toBe('unknown');
    expect(meta.title).toBeNull();
    expect(meta.started).toBeNull();
    expect(meta.participants).toEqual([]);
    expect(meta.recommendedMeetings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// titleFromFilename
// ---------------------------------------------------------------------------

describe('titleFromFilename', () => {
  it('strips date prefix and converts hyphens to spaces', () => {
    expect(titleFromFilename('2026-03-28-design-review.md')).toBe('Design Review');
  });

  it('strips date prefix and converts underscores to spaces', () => {
    expect(titleFromFilename('2026-03-28-sprint_planning.md')).toBe('Sprint Planning');
  });

  it('handles filename without date prefix', () => {
    expect(titleFromFilename('architecture-review.md')).toBe('Architecture Review');
  });

  it('capitalizes each word', () => {
    expect(titleFromFilename('api-auth-strategy.md')).toBe('Api Auth Strategy');
  });

  it('returns "Untitled Meeting" for empty result after stripping', () => {
    expect(titleFromFilename('2026-03-28.md')).toBe('Untitled Meeting');
  });

  it('returns "Untitled Meeting" for empty string', () => {
    expect(titleFromFilename('.md')).toBe('Untitled Meeting');
  });

  it('handles filename without .md extension gracefully', () => {
    expect(titleFromFilename('retro-notes')).toBe('Retro Notes');
  });
});

// ---------------------------------------------------------------------------
// validateMeeting
// ---------------------------------------------------------------------------

describe('validateMeeting', () => {
  it('validates a well-formed meeting with no errors', () => {
    const result = validateMeeting(FULL_MEETING, '2026-03-28-design-review.md');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.hasTitle).toBe(true);
    expect(result.stats.hasMetadata).toBe(true);
    expect(result.stats.hasSummary).toBe(true);
    expect(result.stats.roundCount).toBe(2);
    expect(result.stats.agentCount).toBe(4);
    expect(result.stats.decisionCount).toBe(1);
    expect(result.stats.actionCount).toBe(1);
    expect(result.stats.openCount).toBe(1);
  });

  it('warns when title is missing', () => {
    const content = `<!-- meeting-type: standup -->

## Round 1

**developer:** Shipped the fix.
`;
    const result = validateMeeting(content, '2026-03-28-standup.md');
    expect(result.valid).toBe(true); // warnings don't block validity
    expect(result.warnings).toContain('Missing meeting title (# heading)');
  });

  it('warns when type metadata is missing', () => {
    const content = `# Standup

## Round 1

**developer:** Working on tests.
`;
    const result = validateMeeting(content, '2026-03-28-standup.md');
    expect(result.warnings).toContain('Missing meeting type metadata comment');
  });

  it('warns when filename lacks date prefix', () => {
    const result = validateMeeting(FULL_MEETING, 'design-review.md');
    expect(result.warnings).toContain('Filename does not start with date (YYYY-MM-DD)');
  });

  it('warns about no agent responses in long content', () => {
    const longContent = `# Planning Session\n\n<!-- meeting-type: strategy -->\n\n${'Lorem ipsum dolor sit amet. '.repeat(20)}`;
    const result = validateMeeting(longContent, '2026-03-28-planning.md');
    expect(result.warnings).toContain('No agent responses detected in meeting content');
  });

  it('warns about missing round markers when agents exist', () => {
    const content = `# Quick Chat
<!-- meeting-type: standup -->

**developer:** Just a quick note about the build.

**critic:** The build is broken on CI.
`;
    const result = validateMeeting(content, '2026-03-28-chat.md');
    expect(result.warnings).toContain('Agent responses found but no round markers (## Round N)');
  });

  it('warns when summary has no tagged outcomes', () => {
    const content = `# Review
<!-- meeting-type: design-review -->

## Round 1

**developer:** Looks fine.

## Summary

Everything is great, no issues found.
`;
    const result = validateMeeting(content, '2026-03-28-review.md');
    expect(result.warnings).toContain('Summary section exists but contains no tagged outcomes');
  });

  it('counts words excluding metadata comments', () => {
    const content = `<!-- meeting-type: standup -->
<!-- status: complete -->

# Standup

Short meeting.
`;
    const result = validateMeeting(content, '2026-03-28-standup.md');
    // "Standup" + "Short" + "meeting." = 3 words (heading text stripped of #)
    expect(result.stats.wordCount).toBeGreaterThan(0);
    expect(result.stats.wordCount).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// extractSummary
// ---------------------------------------------------------------------------

describe('extractSummary', () => {
  it('extracts summary section content', () => {
    // The regex uses multiline $ with a lazy quantifier, so it captures
    // up to the next ## heading or --- separator. For the full meeting,
    // the summary ends before ### Recommended Next Meetings.
    const summary = extractSummary(FULL_MEETING);
    expect(summary).not.toBeNull();
    expect(summary).toContain('[DECISION]');
  });

  it('returns null when no summary section exists', () => {
    const content = `# Quick Chat

## Round 1

**developer:** Nothing to summarize yet.
`;
    expect(extractSummary(content)).toBeNull();
  });

  it('stops at next heading', () => {
    const content = `# Meeting

## Summary

- [DECISION] Ship it

## Appendix

Extra notes here.
`;
    const summary = extractSummary(content);
    expect(summary).not.toBeNull();
    expect(summary).toContain('[DECISION]');
    expect(summary).not.toContain('Extra notes');
  });

  it('handles summary as last section with no trailing content', () => {
    const content = `# Meeting

## Round 1

**critic:** Reviewed the code.

## Summary

- [DECISION] Approved the PR`;
    const summary = extractSummary(content);
    expect(summary).not.toBeNull();
    expect(summary).toContain('Approved the PR');
  });

  it('does not match subsection headings like ### Summary', () => {
    const content = `# Meeting

## Round 1

### Summary of thoughts

Just my personal notes.
`;
    // The function looks for "## Summary" specifically
    expect(extractSummary(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getContentForRound
// ---------------------------------------------------------------------------

describe('getContentForRound', () => {
  it('returns full content when round is null', () => {
    const result = getContentForRound(FULL_MEETING, null);
    expect(result).toBe(FULL_MEETING);
  });

  it('returns context + round 1 content', () => {
    const result = getContentForRound(FULL_MEETING, 1);
    expect(result).toContain('# Design Review');
    expect(result).toContain('## Round 1');
    expect(result).toContain('**project-manager:**');
    expect(result).not.toContain('## Round 2');
  });

  it('returns context + round 2 content', () => {
    const result = getContentForRound(FULL_MEETING, 2);
    expect(result).toContain('# Design Review');
    expect(result).toContain('## Round 2');
    expect(result).toContain('set a hard 15-minute expiry');
    expect(result).not.toContain('## Round 1');
  });

  it('returns only context when round does not exist', () => {
    const result = getContentForRound(FULL_MEETING, 99);
    expect(result).toContain('# Design Review');
    expect(result).not.toContain('## Round 1');
    expect(result).not.toContain('## Round 2');
  });

  it('handles content with no rounds', () => {
    const content = `# Quick Chat

Just some notes.
`;
    const result = getContentForRound(content, 1);
    expect(result).toContain('# Quick Chat');
    expect(result).toContain('Just some notes');
  });
});

// ---------------------------------------------------------------------------
// extractAgents
// ---------------------------------------------------------------------------

describe('extractAgents', () => {
  it('extracts agents from **name:** format', () => {
    const agents = extractAgents(FULL_MEETING);
    expect(agents).toContain('project-manager');
    expect(agents).toContain('critic');
    expect(agents).toContain('north-star');
    expect(agents).toContain('developer');
  });

  it('skips metadata field names', () => {
    const content = `**Type:** Standup
**Date:** 2026-03-29
**Participants:** dev, critic
**Facilitator:** orchestrator

**developer:** I worked on the feature.
`;
    const agents = extractAgents(content);
    expect(agents).not.toContain('Type');
    expect(agents).not.toContain('Date');
    expect(agents).not.toContain('Participants');
    expect(agents).not.toContain('Facilitator');
    expect(agents).toContain('developer');
  });

  it('extracts agents from ### Name (Round N) format', () => {
    const content = `# Meeting

## Round 1

### architect (Round 1)

The system should use event sourcing.

### developer (Round 1)

I can build that in a day.
`;
    const agents = extractAgents(content);
    expect(agents).toContain('architect');
    expect(agents).toContain('developer');
  });

  it('deduplicates agents across rounds', () => {
    const agents = extractAgents(FULL_MEETING);
    const unique = new Set(agents);
    expect(agents.length).toBe(unique.size);
  });

  it('returns empty array for content with no agents', () => {
    const content = `# Notes

Just some plain text with no agent markers.
`;
    const agents = extractAgents(content);
    expect(agents).toEqual([]);
  });

  it('handles mixed bold and heading formats', () => {
    const content = `# Meeting

## Round 1

**critic:** This needs work.

### north-star (Round 1)

Think bigger.
`;
    const agents = extractAgents(content);
    expect(agents).toContain('critic');
    expect(agents).toContain('north-star');
  });
});
