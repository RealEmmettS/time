# Project: ATOMIC TIME

A responsive atomic clock web app (time.gov alternative).

## Development

- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Conventions

- **No framework** — vanilla HTML/CSS/JS with Vite
- **Tailwind CSS v4** via PostCSS plugin
- **Fonts:** Space Grotesk (headlines/labels), Inter (body)
- **Design:** Brutalist — zero border radius, hard offset shadows, dot grid bg, all-caps labels
- **Colors:** surface #f6f6f6, text #2d2f2f, accent #00fc40

## Pre-Commit Requirements

Before staging, committing, and pushing:

1. **Update CHANGELOG.md** — add entries under the appropriate version heading
2. **Run `npm run build`** — verify the production build succeeds
3. Commit messages should be concise and descriptive

## Architecture

- `src/atomic-sync.js` — AtomicClockSync class (iTime.live primary, timeapi.io fallback)
- `src/timezone.js` — timezone detection and formatting
- `src/clock-display.js` — DOM rendering with requestAnimationFrame
- `src/main.js` — app entry point, wires everything together
- `src/style.css` — Tailwind imports + custom brutalist styles
