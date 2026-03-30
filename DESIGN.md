# Agent Council Design System

Agent-readable spec. Every session (interactive, worker, future contributors) should follow this.

## Theme

Dark only. No light mode. The app is a developer tool used in focused sessions.

## Colors

All defined as CSS custom properties in `app/globals.css`.

### Surfaces
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#0a0a0b` | Page background |
| `--bg-card` | `#141416` | Cards, panels, form containers |
| `--bg-elevated` | `#1a1a1e` | Elevated elements, hover states |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `--border` | `#2a2a2e` | Default borders |
| `--border-focus` | `#3a3a40` | Focus rings, active borders |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#e8e6e3` | Headings, body text |
| `--text-secondary` | `#a8a5a0` | Descriptions, supporting text |
| `--text-muted` | `#7a7774` | Labels, timestamps, metadata |

### Accent
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#7c6dd8` | Buttons, links, active states |
| `--accent-hover` | `#9080e0` | Hover state for accent |
| `--accent-muted` | `rgba(124,109,216,0.15)` | Accent backgrounds |

### Semantic
| Token | Hex | Usage |
|-------|-----|-------|
| `--live-green` | `#4ade80` | Live meeting indicator |
| `--error` | `#ef4444` | Error states |
| `--warning` | `#f59e0b` | Warnings, flags |
| `--success` | `var(--live-green)` | Success states |

### Tag Colors (decisions, actions, open questions)
| Tag | Color | Background |
|-----|-------|------------|
| Decision | `--color-decision` `#60a5fa` | `rgba(96,165,250,0.15)` |
| Open | `--color-open` `#fbbf24` | `rgba(251,191,36,0.15)` |
| Action | `--color-action` `#4ade80` | `rgba(74,222,128,0.15)` |
| Resolved | `--color-resolved` `#6b7280` | `rgba(107,114,128,0.12)` |
| Idea | `--color-idea` `#a855f7` | `rgba(168,85,247,0.15)` |

## Typography

- **Sans:** Geist Sans (`--font-geist-sans`) — all UI text
- **Mono:** Geist Mono (`--font-geist-mono`) — code blocks, technical values
- No other fonts. Don't add display fonts or decorative typefaces.

### Scale
- Page titles: `text-2xl font-bold` or `text-xl font-bold`
- Section headings: `text-sm font-medium` uppercase tracking-wide (used in activity feed, section headers)
- Body: `text-sm` (14px is the default throughout)
- Metadata/labels: `text-xs` (12px)

## Spacing

- Card padding: `p-4` or `px-5 py-4`
- Section gaps: `space-y-3` or `mb-6`
- Inline gaps: `gap-2` or `gap-3`
- Page max-width: `max-w-6xl mx-auto`

## Components

### Buttons
- **Primary:** `background: var(--accent)`, `color: white`, `rounded-lg`, `text-sm px-4 py-2`
- **Secondary:** `background: var(--bg-card)`, `border: 1px solid var(--border)`, `color: var(--text-muted)`
- **Toggle/chip:** `rounded-full`, `text-xs px-2.5 py-1`, active state uses accent-muted background + accent color
- **Disabled:** `opacity: 0.5` or `opacity: 0.7`

### Cards
- `rounded-lg`, `background: var(--bg-card)`, `border: 1px solid var(--border)`
- Active/selected: `border-color: var(--accent)` or `var(--live-green)`
- No box shadows. Depth comes from border contrast.

### Forms
- Inputs: `background: var(--bg)`, `border: 1px solid var(--border)`, `rounded`, `text-sm px-3 py-2`
- Focus: `outline: 2px solid var(--border-focus)`
- Always include `outline-none` class (custom focus styles handle it)

### Badges/Tags
- Small pill: `text-xs px-1.5 py-0.5 rounded` with semantic color + bg
- Live badge: green background with white text

## Motion

- **Purpose only.** Animation communicates state changes, never decorates.
- New content: `fadeSlideIn` (0.5s ease-out, translateY 8px)
- Loading: `shimmer` gradient animation
- Transitions: `transition-colors` on interactive elements
- Respect `prefers-reduced-motion` — already handled in globals.css

## Patterns to Follow

1. Use CSS variables for all colors — never hardcode hex values in components
2. Use `style={{ }}` for dynamic values from CSS variables (Tailwind can't resolve runtime vars)
3. All text sizes are `text-sm` or `text-xs` — the app is information-dense by design
4. No emojis in permanent UI. Emojis only in meeting content (agent responses)
5. Icons are Unicode characters, not an icon library
6. No gradients, no glassmorphism, no decorative elements
7. Borders create hierarchy, not shadows

## Anti-patterns

- Don't add a light theme
- Don't increase font sizes — the app is built for density
- Don't add icon libraries (lucide, heroicons, etc.) — use Unicode or nothing
- Don't add animation libraries beyond what's installed (Motion, GSAP, Lottie)
- Don't add CSS-in-JS (styled-components, emotion) — use Tailwind + CSS variables
- Don't override the color tokens without updating this document
