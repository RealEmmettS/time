// Copyright QubeTX — tikset.com

export const config = { runtime: "edge" };

// Handler timestamps, not NIC timestamps. Hosting clock accuracy is not measured here.
export function GET(request) {
  const receivedAt = Date.now();
  const value = request
    ? new URL(request.url).searchParams.get("requestId")
    : null;
  const requestId = value && /^[a-zA-Z0-9-]{1,80}$/.test(value) ? value : null;
  const sentAt = Date.now();
  return new Response(
    JSON.stringify({
      version: 1,
      requestId,
      receivedAt,
      sentAt,
      timestamp: sentAt,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
