import { describe, it, expect } from 'vitest';
import { inferMeetingType } from '@/lib/meeting-type-inference';

describe('inferMeetingType', () => {
  // --- Retrospective ---
  it('detects retrospective from "retro"', () => {
    expect(inferMeetingType('Quick retro on the last sprint')).toBe('retrospective');
  });

  it('detects retrospective from "went wrong"', () => {
    expect(inferMeetingType('What went wrong with the deploy')).toBe('retrospective');
  });

  it('detects retrospective from "lessons learned"', () => {
    expect(inferMeetingType('Lessons learned from Q1')).toBe('retrospective');
  });

  it('detects retrospective from "postmortem"', () => {
    expect(inferMeetingType('Postmortem on the auth outage')).toBe('retrospective');
  });

  // --- Incident Review ---
  it('detects incident-review from "incident"', () => {
    expect(inferMeetingType('Review the production incident')).toBe('incident-review');
  });

  it('detects incident-review from "outage"', () => {
    expect(inferMeetingType('Database outage last night')).toBe('incident-review');
  });

  it('detects incident-review from "root cause"', () => {
    expect(inferMeetingType('Find the root cause of the bug')).toBe('incident-review');
  });

  // --- Sprint Planning ---
  it('detects sprint-planning from "sprint"', () => {
    expect(inferMeetingType('Plan the next sprint')).toBe('sprint-planning');
  });

  it('detects sprint-planning from "backlog"', () => {
    expect(inferMeetingType('Groom the backlog')).toBe('sprint-planning');
  });

  it('detects sprint-planning from "what to tackle"', () => {
    expect(inferMeetingType('Decide what to tackle next')).toBe('sprint-planning');
  });

  // --- Design Review ---
  it('detects design-review from "review the"', () => {
    expect(inferMeetingType('Review the API design')).toBe('design-review');
  });

  it('detects design-review from "component"', () => {
    expect(inferMeetingType('New button component approach')).toBe('design-review');
  });

  it('detects design-review from "user flow"', () => {
    expect(inferMeetingType('Discuss the checkout user flow')).toBe('design-review');
  });

  // --- Architecture ---
  it('detects architecture from "architecture"', () => {
    expect(inferMeetingType('Architecture of the new auth layer')).toBe('architecture');
  });

  it('detects architecture from "database"', () => {
    expect(inferMeetingType('Database schema for user profiles')).toBe('architecture');
  });

  it('detects architecture from "system design"', () => {
    expect(inferMeetingType('System design for the payment flow')).toBe('architecture');
  });

  it('detects architecture from "scaling"', () => {
    expect(inferMeetingType('Scaling the API for 10x traffic')).toBe('architecture');
  });

  // --- Standup ---
  it('detects standup from "standup"', () => {
    expect(inferMeetingType('Morning standup')).toBe('standup');
  });

  it('detects standup from "daily sync"', () => {
    expect(inferMeetingType('Daily sync with the team')).toBe('standup');
  });

  it('detects standup from "blockers"', () => {
    expect(inferMeetingType('Check on blockers')).toBe('standup');
  });

  // --- Strategy ---
  it('detects strategy from "roadmap"', () => {
    expect(inferMeetingType('Discuss the Q2 roadmap')).toBe('strategy');
  });

  it('detects strategy from "direction"', () => {
    expect(inferMeetingType('Product direction for 2026')).toBe('strategy');
  });

  it('detects strategy from "goals"', () => {
    expect(inferMeetingType('Review our goals for the quarter')).toBe('strategy');
  });

  // --- Fallback ---
  it('falls back to strategy for vague topics', () => {
    expect(inferMeetingType('We need to talk about things')).toBe('strategy');
  });

  it('falls back to strategy for empty string', () => {
    expect(inferMeetingType('')).toBe('strategy');
  });

  it('uses custom fallback when provided', () => {
    expect(inferMeetingType('random chat', 'standup')).toBe('standup');
  });

  // --- Case insensitivity ---
  it('is case insensitive', () => {
    expect(inferMeetingType('RETROSPECTIVE on Q1')).toBe('retrospective');
    expect(inferMeetingType('SPRINT planning')).toBe('sprint-planning');
    expect(inferMeetingType('Architecture Review')).toBe('architecture');
  });

  // --- Specificity: more specific types win ---
  it('incident-review beats design-review for "review" + "incident"', () => {
    // "Review the incident" has both "review the" and "incident"
    // incident-review is checked first (more specific), so it should win
    expect(inferMeetingType('Review the incident from last week')).toBe('incident-review');
  });

  it('retrospective beats incident-review for "postmortem" + "outage"', () => {
    // Both retro and incident keywords present — retro checked first
    expect(inferMeetingType('Postmortem on the outage')).toBe('retrospective');
  });
});
