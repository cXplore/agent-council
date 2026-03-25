<!-- status: complete -->
<!-- demo: true -->

# Strategy Session — API Architecture (Sample)

**Date:** 2026-01-15
**Type:** Strategy Session
**Participants:** project-manager, critic, north-star, developer, architect

## Context

Evaluating whether to use REST or GraphQL for the new API layer. The team has 12 endpoints currently, all REST.

---

**project-manager:** We have 12 endpoints currently, all REST. Migration cost to GraphQL would be significant — roughly 2 weeks of refactoring. The question is whether the flexibility justifies the investment at this stage.

**critic:** GraphQL solves a problem we don't have yet — over-fetching from multiple related endpoints. With 12 endpoints, REST is fine. The real risk is adding complexity for theoretical future benefits. Every new hire will need to learn the GraphQL schema layer. That's a hidden cost.

**north-star:** The question isn't "do we need GraphQL today" — it's "will our API needs grow in ways that make REST painful?" If we're building toward a mobile app or third-party integrations, GraphQL becomes compelling. The schema becomes a contract that multiple consumers can rely on.

**developer:** From an implementation standpoint, our current REST setup is clean and well-typed with Zod validation. GraphQL would add a schema layer, resolvers, and a new dependency (Apollo or Yoga). The only concrete win would be if the frontend needs to compose data from multiple endpoints in a single request — which it currently doesn't.

**architect:** This is a reversibility question. Moving from REST to GraphQL later is harder than starting with it. But starting with GraphQL when you don't need it adds ongoing maintenance cost for no current benefit. My recommendation: stay REST, but design endpoints with future composition in mind. If we hit 30+ endpoints or add a mobile client, revisit.

---

*Round 2 — critic and north-star respond to architect's framing*

**critic:** Architect's "reversibility" framing is the right lens. But I'd add: the team's familiarity matters too. Everyone knows REST. Nobody here has production GraphQL experience. Learning on a live product is risky.

**north-star:** Fair. I'll concede — REST is the right call for now. But I want us to document the trigger conditions: "We revisit GraphQL when we hit 25 endpoints, add a mobile client, or onboard a third-party integration." Otherwise this decision becomes permanent by inertia.

---

## Summary

### Decisions
- Stay with REST for the current API layer
- Document trigger conditions for revisiting GraphQL (25+ endpoints, mobile client, or third-party integrations)
- Design new endpoints with future composition in mind (consistent response shapes, pagination patterns)

### Action Items
- [ ] Document API design guidelines (consistent response shapes, error formats)
- [ ] Add the GraphQL trigger conditions to the architecture decision log
- [ ] Review endpoint count at the next quarterly planning

### Open Questions
- Should we adopt tRPC as a typed REST alternative? (separate discussion)
