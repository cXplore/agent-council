<!-- meeting-type: design-review -->
<!-- status: complete -->
<!-- created: 2026-01-15 10:00 -->
<!-- participants: project-manager, critic, developer -->
<!-- topic: API Authentication Strategy -->
<!-- rounds: 2 -->

# Design Review: API Authentication Strategy

## Context

Our public API currently uses simple API keys for authentication. As we prepare to open the API to third-party developers, we need to decide whether to stay with API keys, adopt OAuth 2.0, or use a hybrid approach. This review evaluates the trade-offs.

### Key Questions

1. What authentication model best fits our use case?
2. How do we handle token refresh and revocation?
3. What is the migration path for existing API key users?

---

## Round 1 (Parallel)

### Project Manager (Round 1)

We have 340 active API consumers today, all using static API keys. Switching to OAuth 2.0 is the right long-term play, but we cannot break existing integrations. The practical path is a hybrid: keep API keys for server-to-server use, add OAuth for user-facing integrations. Migration timeline matters -- if we force a cutover, we will lose partners. A 12-month deprecation window with clear documentation is the minimum.

### Critic (Round 1)

The hybrid approach sounds reasonable until you think about the support burden. Two auth systems means two sets of docs, two code paths for every middleware check, and twice the surface area for security bugs. If we go hybrid, we need a hard sunset date for API keys, not an open-ended "we'll support both." Also, the current API keys have no scoping -- they are all-or-nothing. That is a security gap regardless of what we choose next.

### Developer (Round 1)

Implementation-wise, OAuth 2.0 with PKCE for public clients is about 2 weeks of work for the auth server, plus another week for SDK updates. API keys are simpler to maintain but lack refresh and revocation semantics. I would lean toward OAuth with a lightweight wrapper that lets existing API key users authenticate without code changes during the transition period. We already have the token infrastructure from our SSO system -- we can reuse about 60% of it.

---

## Round 2 (Sequential)

### Project Manager (Round 2)

The critic raises a fair point about the support burden. I agree we need a hard sunset date -- 12 months from GA of the OAuth flow. The developer's idea of a wrapper that maps API keys to OAuth tokens behind the scenes is the right migration path. It lets existing consumers keep working while we build toward a single system. Let us document this as the plan: OAuth 2.0 as the target, API key compatibility layer for migration, 12-month sunset.

### Critic (Round 2)

The wrapper approach is clever but adds complexity. Make sure the wrapper is thin and stateless -- do not build a full translation layer that becomes its own maintenance burden. One non-negotiable: we must add scope restrictions to API keys immediately, even before the OAuth migration. An unscoped key is a breach waiting to happen, and that risk exists today regardless of the OAuth timeline.

### Developer (Round 2)

Agreed on the scoping fix -- that is a 3-day task, independent of the OAuth work. I can start on that this sprint. For the wrapper, I am thinking of a middleware that accepts an API key in the Authorization header, looks up the associated OAuth client, and issues a short-lived token internally. No state, no session -- just a mapping. The existing rate limiting and audit logging stay exactly the same because everything flows through the same token validation path downstream.

---

## Summary

This review evaluated authentication options for our public API as we prepare for third-party developer access.

**[DECISION]** Adopt OAuth 2.0 with PKCE as the primary authentication mechanism for the public API, with a 12-month migration window from API keys.

**[DECISION]** Add scope restrictions to existing API keys immediately, before beginning the OAuth migration work.

**[OPEN]** How do we handle rate limiting differences between OAuth tokens and legacy API keys during the transition period?

**[ACTION]** Developer to implement API key scoping this sprint (estimated 3 days), then begin OAuth 2.0 auth server work next sprint.

### Recommended Next Meetings
- **Architecture Review**: Token storage and refresh architecture for the OAuth implementation
- **Design Review**: Developer portal and API documentation for the new auth flow

---

<!-- meeting-outcomes
{
  "decisions": [
    "Adopt OAuth 2.0 with PKCE as primary auth, 12-month migration window",
    "Add scope restrictions to existing API keys immediately"
  ],
  "openQuestions": [
    "Rate limiting differences between OAuth tokens and legacy API keys during transition"
  ],
  "actionItems": [
    "Developer: implement API key scoping this sprint (3 days), then OAuth auth server next sprint"
  ],
  "recommendedMeetings": [
    { "type": "architecture-review", "topic": "Token storage and refresh architecture" },
    { "type": "design-review", "topic": "Developer portal and API documentation" }
  ]
}
-->
