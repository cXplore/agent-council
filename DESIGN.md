# Agent Council Design System

Aesthetic direction: **refined dark with depth.** Surfaces have subtle transparency and glow. Typography has clear hierarchy. Accent color (purple) used with intention. Everything breathes. Rich but clean.

## Theme

Dark only. No light mode. The app is a developer tool used in focused sessions.

## Visual Language

- **Glass surfaces** — cards and panels use `backdrop-filter: blur()` with slight transparency. Not flat opaque boxes.
- **Subtle glow** — accent color bleeds softly around interactive and focused elements.
- **Background depth** — body has a radial gradient (purple-tinted center), not flat black.
- **Soft shadows** — elements have depth via `box-shadow`, not just borders.
- **Generous spacing** — content breathes. Cards use `rounded-xl`, comfortable padding.
- **Clean layouts** — richness comes from surface treatment, not layout complexity.

## Colors

All defined as CSS custom properties in `app/globals.css`.

### Surfaces
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#08080a` | Page background |
| `--bg-card` | `rgba(18,18,22,0.7)` | Cards, panels (transparent for glass) |
| `--bg-elevated` | `rgba(28,28,34,0.8)` | Elevated elements |
| `--bg-solid` | `#121216` | Opaque backgrounds when blur isn't needed |

### Borders
| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `rgba(255,255,255,0.07)` | Default borders (white opacity, not gray) |
| `--border-focus` | `rgba(255,255,255,0.15)` | Focus rings, hover borders |
| `--border-subtle` | `rgba(255,255,255,0.04)` | Very subtle separators |

### Shadows & Glow
| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.3)` | Subtle card depth |
| `--shadow-card` | `0 4px 24px rgba(0,0,0,0.2), 0 0 0 1px var(--border)` | Elevated cards |
| `--shadow-glow` | `0 0 30px var(--accent-glow)` | Active/focused elements |
| `--shadow-glow-sm` | `0 0 15px rgba(124,109,216,0.12)` | Subtle accent glow |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#edebe8` | Headings, body text |
| `--text-secondary` | `#a8a5a0` | Descriptions, supporting text |
| `--text-muted` | `#6b6865` | Labels, timestamps, metadata |

### Accent
| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#7c6dd8` | Buttons, links, active states |
| `--accent-hover` | `#9080e0` | Hover state |
| `--accent-muted` | `rgba(124,109,216,0.12)` | Accent backgrounds |
| `--accent-glow` | `rgba(124,109,216,0.25)` | Glow effects |

### Tag Colors (decisions, actions, open questions)
| Tag | Color | Background |
|-----|-------|------------|
| Decision | `--color-decision` `#60a5fa` | `rgba(96,165,250,0.1)` |
| Open | `--color-open` `#fbbf24` | `rgba(251,191,36,0.1)` |
| Action | `--color-action` `#4ade80` | `rgba(74,222,128,0.1)` |
| Resolved | `--color-resolved` `#6b7280` | `rgba(107,114,128,0.08)` |

## Typography

- **Sans:** Geist Sans (`--font-geist-sans`) — all UI text
- **Mono:** Geist Mono (`--font-geist-mono`) — code blocks, technical values
- Page titles: `text-xl font-semibold` or `text-2xl font-bold`
- Section headings: `text-sm font-medium` uppercase tracking-wide
- Body: `text-sm` (14px default)
- Metadata: `text-xs` (12px)

## CSS Utility Classes

```css
.glass          /* Transparent card with backdrop-blur */
.glass-elevated /* Elevated glass with shadow */
.glow-accent    /* Subtle purple glow */
.glow-accent-hover  /* Glow on hover */
.glow-live      /* Green glow for live indicators */
.card-hover     /* Lift + shadow on hover */
.pulse-soft     /* Gentle pulse for live dots */
```

## Component Patterns

### Cards
- `rounded-xl`, glass background, `var(--border)` border
- Hover: `card-hover` class (lift + shadow + border brighten)
- Live meetings: green glow via `glow-live`

### Buttons
- **Primary:** `var(--accent)` background, white text, `rounded-lg`, glow on hover
- **Secondary:** `var(--bg-card)` with `backdrop-filter`, soft border
- **Chip/pill:** `rounded-full` or `rounded-lg`, xs text, accent-muted when active

### Navigation
- Glass nav bar: transparent background, `backdrop-filter: blur(16px)`, soft border
- Active state: accent underline or pill highlight

### Panels
- Outcomes/side panels: glass surface, shadow for depth, `backdrop-filter: blur(12px)`

## Motion

- Enter animations: `fadeSlideIn` (0.5s ease-out, translateY 8px)
- Loading: `shimmer` gradient animation
- Live indicators: `pulse-soft` (gentle opacity pulse)
- Hover transitions: `transition-all duration-200` for interactive elements
- Cards: `transition: transform 0.2s, box-shadow 0.3s`
- Respect `prefers-reduced-motion`
