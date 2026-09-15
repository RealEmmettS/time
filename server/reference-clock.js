// Copyright QubeTX — tikset.com
import { queryCloudflare } from "./ntp.js";
import { performance } from "node:perf_hooks";

const CACHE_MS = 60_000;
const DRIFT = 100 / 1_000_000;

export function createReferenceClock({
  query = queryCloudflare,
  now = () => performance.now(),
  wall = () => Date.now(),
} = {}) {
  let reference = null;
  let pending = null;
  let retryAfter = -Infinity;
  return {
    now,
    async get() {
      const mono = now();
      const clockChanged =
        reference &&
        Math.abs(wall() - reference.wall - (mono - reference.measuredAt)) > 20;
      if (
        reference &&
        !clockChanged &&
        mono >= reference.measuredAt &&
        mono - reference.measuredAt < CACHE_MS
      )
        return reference;
      if (pending) return pending;
      if (mono < retryAfter)
        throw new Error("Time reference is temporarily unavailable");
      // Share one bounded refresh within this function instance; do not poll per visitor.
      pending = (async () => {
        try {
          const samples = [];
          for (let i = 0; i < 3; i++) samples.push(await query());
          const at = now();
          const lower = Math.max(
            ...samples.map(
              (s) =>
                s.offset - s.uncertainty - Math.abs(at - s.measuredAt) * DRIFT,
            ),
          );
          const upper = Math.min(
            ...samples.map(
              (s) =>
                s.offset + s.uncertainty + Math.abs(at - s.measuredAt) * DRIFT,
            ),
          );
          if (lower > upper) throw new Error("NTP samples disagree");
          // Keep the best complete sample's full range; do not average common upstream errors away.
          const best = samples.reduce((a, b) =>
            a.uncertainty < b.uncertainty ? a : b,
          );
          reference = {
            ...best,
            uncertainty:
              best.uncertainty + Math.abs(at - best.measuredAt) * DRIFT,
            measuredAt: at,
            wall: wall(),
          };
          return reference;
        } catch (error) {
          reference = null;
          retryAfter = now() + CACHE_MS;
          throw error;
        } finally {
          pending = null;
        }
      })();
      return pending;
    },
  };
}

export function createTimeHandler(clock = createReferenceClock()) {
  return async function GET(request) {
    const entry = clock.now();
    const value = request
      ? new URL(request.url).searchParams.get("requestId")
      : null;
    const requestId =
      value && /^[a-zA-Z0-9-]{1,80}$/.test(value) ? value : null;
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      Pragma: "no-cache",
      Expires: "0",
    };
    try {
      const reference = await clock.get();
      const sent = clock.now();
      const receivedAt = reference.offset + entry;
      const sentAt = reference.offset + sent;
      return Response.json(
        {
          version: 1,
          requestId,
          receivedAt,
          sentAt,
          timestamp: sentAt,
          source: {
            name: "time.cloudflare.com",
            protocol: "NTP",
            authenticated: false,
            uncertaintyMs:
              reference.uncertainty +
              Math.max(
                Math.abs(entry - reference.measuredAt),
                Math.abs(sent - reference.measuredAt),
              ) *
                DRIFT,
            ageMs: Math.max(0, sent - reference.measuredAt),
            roundTripMs: reference.delay,
            rootDelayMs: reference.rootDelay,
            rootDispersionMs: reference.rootDispersion,
            stratum: reference.stratum,
            leapIndicator: reference.leap,
          },
        },
        { headers },
      );
    } catch {
      return Response.json(
        { error: "Cloudflare time reference unavailable" },
        { status: 503, headers },
      );
    }
  };
}
