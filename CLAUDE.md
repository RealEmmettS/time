# Repository guidance

ATOMIC TIME is a vanilla JavaScript/Vite website with a Vercel Node.js time endpoint.

## Checks

- `npm ci`, `npm test`, `npm run check`, `npm run build`.
- Tests use Node's built-in runner and injected clocks/transport; no framework is required.
- Update package version and CHANGELOG.md for substantive changes.
- Keep copyright headers on source files and use Prettier.
- Vercel's GitHub integration deploys main to production; qualify a preview first.

## Architecture

- `src/timing.js`: pure time-transfer math, UTC parsing, interval selection and uncertainty assumptions.
- `src/atomic-sync.js`: sampling, source checks, monotonic reference and lifecycle.
- `src/second-scheduler.js`: corrected-boundary rendering with frame/timer injection.
- `src/diagnostics.js`: plain-language status interpretation.
- `src/clock-display.js`: DOM binding, diagnostics and Pretext responsive sizing.
- `src/main.js`: startup and browser lifecycle; `src/timezone.js`: existing timezone behavior.
- `api/time.js`: Cloudflare-referenced handler timestamps with legacy timestamp compatibility.
- `server/ntp.js` and `server/reference-clock.js`: bounded NTP client, packet validation, cached monotonic upstream reference, uncertainty propagation.
- `src/clock-help.js`: local OS detection and platform-specific setup instructions.

Read METHODOLOGY.md before changing timing behavior. Keep clock correctness independent of `Date.now()` after synchronization. Do not describe network intervals or timestamp resolution as absolute UTC accuracy. Never query time.gov's private timestamp endpoints.

## Design

Preserve the square borders, hard shadows, dot grid, Makira/Space Grotesk typography, green accent, branding, 12/24-hour preference, and responsive large clock. Keep technical explanations in the diagnostics disclosure. DOM IDs in index.html and clock-display.js must agree. Pretext requires the existing Vite optimizeDeps entry.
