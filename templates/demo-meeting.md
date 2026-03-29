<!-- meeting-type: design-review -->
<!-- status: complete -->
<!-- created: 2026-01-15 10:00 -->
<!-- participants: project-manager, designer, critic, developer -->

# Design Review — Dark Mode That Actually Feels Good

## Context

Users keep asking for dark mode. We could ship a basic CSS toggle in an afternoon, but we want to do it right — a dark mode that feels intentional, not just "invert all the colors." The question: what's the approach that gives us a great dark mode without a month of design work?

## Round 1

**project-manager:** User data: 68% of our users have their OS set to dark mode. We've had 47 feature requests for dark mode in the last quarter — it's our #2 most requested feature after mobile support. Currently we're light-only with hardcoded colors scattered across components. No design tokens, no CSS variables, no theme system.

**designer:** The biggest mistake teams make with dark mode is treating it as "light mode but dark." That produces a washed-out, lifeless UI. Here's what actually works:

1. **Don't invert — rebalance.** Dark backgrounds need lower contrast text (not pure white — use `#e2e8f0` instead of `#ffffff`). Reduce saturation on accent colors by ~15% so they don't vibrate against dark surfaces.

2. **Elevation through lightness, not shadow.** In light mode, cards feel elevated via shadows. In dark mode, shadows are invisible — instead, use progressively lighter surface colors: `#0a0a0f` → `#141419` → `#1e1e24`. Three levels is enough.

3. **Borders become essential.** In light mode you can get away without borders because shadows create separation. In dark mode, subtle borders (`rgba(255,255,255,0.06)`) are what prevent everything from melting together.

4. **Use CSS custom properties from day one.** Don't build a "dark theme" — build a token system that supports any theme. `--bg`, `--bg-card`, `--bg-elevated`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--border`. Switch the values, not the components.

**critic:** The CSS variables approach is right, but I want to flag the transition problem nobody's thinking about: **what happens when you toggle themes?** If every component re-renders with new colors, you get a jarring flash. Worse — some components will have stale colors for a frame, creating a "zebra" effect during the switch.

Two things we need to decide:
1. Do we support manual toggle, OS preference, or both?
2. Do we animate the transition or instant-switch?

Also: the designer said "three surface levels." That sounds clean in theory. In practice, every developer will eyeball their grays independently. We need the actual hex values committed before anyone writes CSS. Otherwise we'll ship with 14 slightly different shades of dark gray.

**developer:** Implementation plan: CSS custom properties on `:root` with a `.dark` class override. Use `prefers-color-scheme` media query as default, with a manual toggle that writes to `localStorage` and adds/removes the `.dark` class on `<html>`.

For the flash-of-wrong-theme problem: I'll add a tiny inline script in `<head>` that reads `localStorage` before React hydrates. This prevents the flash because the correct theme is set before any paint happens. Tailwind CSS v4 supports this natively with `@custom-variant dark (&:where(.dark, .dark *))`.

The actual color swap is ~2 hours of work if the designer gives me the token values. The `localStorage` + `prefers-color-scheme` bridge is another hour. Testing across all pages is where the time goes — I'd estimate a full day total.

## Round 2

**project-manager:** Love the speed estimate. One day for dark mode is compelling. But I want to make sure we're not creating technical debt. Designer — are those 4 principles enough to guide the developer, or do we need a full color spec before coding starts?

**designer:** The developer needs exactly 8 tokens. Here they are:

```
Light:                    Dark:
--bg: #ffffff             --bg: #0a0a0f
--bg-card: #f8fafc        --bg-card: #141419
--bg-elevated: #f1f5f9    --bg-elevated: #1e1e24
--text-primary: #0f172a   --text-primary: #e2e8f0
--text-secondary: #475569 --text-secondary: #94a3b8
--text-muted: #94a3b8     --text-muted: #4b5563
--accent: #3b82f6         --accent: #60a5fa
--border: #e2e8f0         --border: rgba(255,255,255,0.08)
```

That's it. Every component uses these 8 variables. If a component needs a color that isn't one of these 8, it's a smell — either the component is doing something unusual (and should be noted), or one of these tokens needs adjusting.

For the transition: no animation. Instant switch. Animated theme transitions look cute in demos but feel sluggish in daily use. Users toggle once and leave it.

**critic:** Those token values look solid. My remaining concern: we need to test this with actual content, not just empty layouts. The most common dark mode bug is **invisible text on dark images** and **unreadable code blocks.** Before we ship, we need to verify:
- Syntax highlighting in code blocks works in both themes
- User-uploaded images with transparent backgrounds don't disappear
- Status indicators (green/red/yellow dots) remain distinguishable in both modes

If we test these three scenarios, I'm confident we won't ship something embarrassing.

**developer:** Agreed on all points. I'll use the 8 tokens, add the `<head>` script for flash prevention, and test against code blocks, images, and status indicators before merging. One day, shipping tomorrow.

## Summary

- [DECISION] Use CSS custom properties with 8 design tokens — switch values via `.dark` class, not per-component overrides
- [DECISION] Support both OS preference (`prefers-color-scheme`) and manual toggle with `localStorage` persistence
- [DECISION] No transition animation on theme switch — instant swap
- [ACTION] Implement dark mode with the 8-token system — assigned to developer. Effort: 1 day.
- [ACTION] Test dark mode against code blocks, transparent images, and status indicators before merge — assigned to developer
- [OPEN:high-contrast] Should we also support a high-contrast mode for accessibility? Deferred — the token system makes it trivial to add later.

<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [
    { "text": "Use CSS custom properties with 8 design tokens for theming", "rationale": "Clean separation, supports future themes, minimal maintenance" },
    { "text": "Support both OS preference and manual toggle with localStorage", "rationale": "Respects user system settings while allowing override" },
    { "text": "No transition animation on theme switch", "rationale": "Animated transitions feel sluggish in daily use" }
  ],
  "actions": [
    { "text": "Implement dark mode with 8-token system", "assignee": "developer", "effort": "1 day" },
    { "text": "Test against code blocks, transparent images, and status indicators", "assignee": "developer" }
  ],
  "open_questions": [
    { "slug": "high-contrast", "text": "Should we add a high-contrast accessibility mode?" }
  ],
  "resolved": []
}
-->
