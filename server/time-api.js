// Copyright QubeTX — tikset.com
import { queryNtp } from "./ntp.js";
import { createReferenceClock, createTimeHandler } from "./reference-clock.js";

export function createTimeApi({
  cloudflare,
  nist,
  ntp = queryNtp,
  now = () => performance.now(),
  wall = () => Date.now(),
} = {}) {
  let nextNistQuery = -Infinity;
  const handlers = {
    cloudflare: createTimeHandler(cloudflare ?? createReferenceClock()),
    nist: createTimeHandler(
      nist ??
        createReferenceClock({
          now,
          wall,
          sourceName: "time.nist.gov",
          sampleCount: 1,
          query: () => {
            const at = now();
            if (at < nextNistQuery) throw new Error("NIST polling backoff");
            // One NIST request per cache refresh; also protect early invalidations.
            nextNistQuery = at + 60_000;
            return ntp({ host: "time.nist.gov" });
          },
        }),
    ),
  };
  return (request) => {
    const source =
      new URL(request.url).searchParams.get("source") || "cloudflare";
    if (!Object.hasOwn(handlers, source))
      return Response.json(
        { error: "Unsupported source" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    return handlers[source](request);
  };
}
