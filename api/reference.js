// Copyright QubeTX — tikset.com
// Node.js runtime (the default): outbound UDP is needed for this NTP probe.
import { queryCloudflare } from "../server/ntp.js";

export async function GET() {
  try {
    const result = await queryCloudflare();
    return Response.json(
      { source: "time.cloudflare.com", reachable: true, ...result },
      {
        headers: {
          "Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        source: "time.cloudflare.com",
        reachable: false,
        reason: error.message,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
