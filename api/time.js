// Copyright QubeTX — tikset.com

/**
 * Vercel Edge Function — self-hosted time endpoint.
 * Returns the current server timestamp (NTP-synced, Stratum 2-3).
 * Runs on Vercel's global edge network for <1ms cold start and ~5-20ms RTT.
 */

export const config = { runtime: "edge" };

export function GET() {
  const now = Date.now();
  return new Response(JSON.stringify({ timestamp: now }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
