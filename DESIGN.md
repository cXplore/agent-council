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

### Surfaces — Deep Indigo
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#070610` | Page background (deep indigo-black) |
| `--bg-card` | `rgba(16,14,30,0.85)` | Cards, panels (indigo-tinted glass) |
| `--bg-elevated` | `rgba(24,20,44,0.9)` | Elevated elements |
| `--bg-solid` | `#100e1c` | Opaque backgrounds when blur isn't needed |

### Borders — Cool Purple-Tinted
| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `rgba(200,180,255,0.07)` | Default borders (purple-tinted white opacity) |
| `--border-focus` | `rgba(200,180,255,0.16)` | Focus rings, hover borders |
| `--border-subtle` | `rgba(200,180,255,0.03)` | Very subtle separators |

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

### Accent — Purple-Pink Family
One color family for all interactive elements. No warm/cool clash.

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#b070e0` | Buttons, active states, interactive |
| `--accent-hover` | `#c88cf0` | Hover state |
| `--accent-muted` | `rgba(176,112,224,0.14)` | Accent backgrounds |
| `--accent-glow` | `rgba(176,112,224,0.28)` | Glow effects |
| `--accent-pink` | `#e070a0` | Secondary highlights, new-entry indicators |
| `--accent-cyan` | `#50d0c8` | Cool contrast for data/tech elements |
| `--accent-warm` | `#e0a060` | Minimal decorative use only |

### Tag Colors — Cosmic
| Tag | Color | Background |
|-----|-------|------------|
| Decision | `#70b0f0` (soft blue) | `rgba(112,176,240,0.1)` |
| Open | `#f0a860` (amber) | `rgba(240,168,96,0.1)` |
| Action | `#50e0a0` (green) | `rgba(80,224,160,0.1)` |
| Resolved | `#706880` (cool gray) | `rgba(112,104,128,0.08)` |
| Idea | `#d080f0` (purple) | `rgba(208,128,240,0.1)` |

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
