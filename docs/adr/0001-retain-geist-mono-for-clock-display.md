# ADR 0001: Retain Geist Mono for the main clock display

- Date: 2026-11-02
- Status: Accepted
- Decision maker: Emmett

## Context

The main clock already uses Geist Mono. Emmett reviewed screenshot comparisons
of four font families to decide whether to keep it or change the clock's
typography:

| Font family | Preview weight                     |
| ----------- | ---------------------------------- |
| Geist Mono  | Bold (700)                         |
| Geist Serif | Regular (400), its supplied weight |
| Makira      | Bold (700)                         |
| Unbounded   | Bold (700)                         |

The comparisons used the same displayed time, **10:28:36**, font size, and
viewport. Only the main clock's typography changed; the surrounding interface
provided the same visual context.

## Decision

Retain **Geist Mono** for the main clock digits. After comparing all four
families, Emmett chose Geist Mono again: "we should stick with mono."

## Rationale

The decision reflects Emmett's visual preference after reviewing the alternatives
in the actual clock layout. Geist Serif, Makira, and Unbounded were considered
but were not selected for the main clock. This was a visual design comparison,
not a usability study or a measurement of readability or performance.

## Consequences

- Keep the existing Geist Mono clock font, bold weight, tabular numerals, and
  monospace fallbacks.
- Keep Makira for the surrounding body text, date, and time badges, and Geist
  Mono for technical labels.
- The comparison does not require a font or runtime change; it reaffirms the
  existing typography.
