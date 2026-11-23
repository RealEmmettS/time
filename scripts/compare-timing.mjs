// Copyright QubeTX — tikset.com
// One set of exchanges is replayed through both estimators for a fair comparison.
import { execFileSync } from "node:child_process";
import {
  fuseIntervals,
  timingSample,
  timestampReceipt,
} from "../src/timing.js";
import { previewHeaders } from "./preview-headers.mjs";

const old = execFileSync("git", ["show", "20652b3:src/atomic-sync.js"], {
  encoding: "utf8",
});
const helpers = old.slice(
  old.indexOf("function filterOutliers"),
  old.indexOf("// ─── Main Class"),
);
const legacy = new Function(
  `${helpers}; return samples => marzullo(filterOutliers(samples));`,
)();
const stats = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length
    ? {
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
        ],
        min: sorted[0],
        max: sorted.at(-1),
      }
    : null;
};
const rows = [];
const target = process.argv[2];
if (target) {
  const base = new URL(target);
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && base.hostname === "localhost")
  )
    throw new Error("Use a preview HTTPS URL");
  const headers = previewHeaders(
    base,
    process.env.TIKSET_PREVIEW_ORIGIN,
    process.env.TIKSET_PREVIEW_COOKIE,
  );
  for (let round = 0; round < 6; round++) {
    const modern = [],
      bodyTimed = [],
      previous = [];
    const start = performance.now();
    let wallAnchor;
    let upstreamUncertainty = 0;
    for (let i = -1; i < 8; i++) {
      const id = `compare-${round}-${i + 1}-${Date.now()}`;
      const url = new URL(`/api/time?requestId=${id}`, base);
      const sent = performance.now();
      const before = Date.now();
      wallAnchor ??= before - sent;
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
        redirect: "error",
        headers,
      });
      const headersAt = performance.now();
      const afterHeaders = Date.now();
      const text = await response.text();
      const received = performance.now();
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      ) {
        throw new Error(
          "Preview endpoint is protected or did not return JSON; authenticate the preview first.",
        );
      }
      const data = JSON.parse(text);
      if (!response.ok || data.version !== 1 || data.requestId !== id)
        throw new Error(
          "Preview endpoint is not accessible or does not implement protocol v1",
        );
      if (i >= 0) {
        upstreamUncertainty = Math.max(
          upstreamUncertainty,
          data.source?.uncertaintyMs ?? 0,
        );
        const exchange = {
          sent,
          received,
          serverReceived: data.receivedAt,
          serverSent: data.sentAt,
        };
        bodyTimed.push(timingSample(exchange));
        modern.push(
          timingSample({
            ...exchange,
            received: timestampReceipt(
              response.headers.get("x-tikset-sent-at"),
              data.sentAt,
              headersAt,
              received,
            ),
          }),
        );
        previous.push({
          offset: data.receivedAt - (before + afterHeaders) / 2,
          rtt: headersAt - sent,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const revised = fuseIntervals(modern);
    const completeBody = fuseIntervals(bodyTimed);
    rows.push({
      round,
      elapsedMs: performance.now() - start,
      legacy: legacy(previous),
      bodyTimed: completeBody && {
        ...completeBody,
        offset: completeBody.offset - wallAnchor,
      },
      revised: revised && { ...revised, offset: revised.offset - wallAnchor },
      upstreamUncertainty,
      combinedUncertainty: revised && revised.uncertainty + upstreamUncertainty,
      fastestRttMs: Math.min(...modern.map((s) => s.rtt)),
    });
  }
} else {
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let round = 0; round < 500; round++) {
    const modern = [],
      bodyTimed = [],
      previous = [];
    const truth = 1000;
    for (let i = 0; i < 8; i++) {
      const outbound = 8 + random() * 20;
      const inbound = 8 + random() * 20;
      const processing = random() * 60;
      const body = random() * 5;
      const sent = i * 150;
      const exchange = {
        sent,
        received: sent + outbound + processing + inbound,
        serverReceived: sent + outbound + truth,
        serverSent: sent + outbound + processing + truth,
      };
      modern.push(timingSample(exchange));
      bodyTimed.push(
        timingSample({ ...exchange, received: exchange.received + body }),
      );
      previous.push({
        offset: truth + (outbound - inbound - processing) / 2,
        rtt: outbound + inbound + processing,
      });
    }
    rows.push({
      truth,
      legacy: legacy(previous),
      bodyTimed: fuseIntervals(bodyTimed),
      revised: fuseIntervals(modern),
    });
  }
}
console.log(
  JSON.stringify(
    {
      mode: target
        ? "paired live HTTPS samples; absolute UTC error not established"
        : "seeded synthetic delays with known truth; not a real-world accuracy claim",
      source: target ? new URL(target).origin : "synthetic",
      trials: rows.length,
      legacy: {
        offsets: stats(rows.map((r) => r.legacy?.offset)),
        uncertainty: stats(rows.map((r) => r.legacy?.uncertainty)),
        absoluteError: target
          ? null
          : stats(rows.map((r) => Math.abs(r.legacy.offset - r.truth))),
      },
      previousBodyTiming: {
        uncertainty: stats(rows.map((r) => r.bodyTimed?.uncertainty)),
        absoluteError: target
          ? null
          : stats(
              rows
                .filter((r) => r.bodyTimed)
                .map((r) => Math.abs(r.bodyTimed.offset - r.truth)),
            ),
      },
      revised: {
        acceptedRounds: rows.filter((r) => r.revised).length,
        offsets: stats(rows.map((r) => r.revised?.offset)),
        uncertainty: stats(rows.map((r) => r.revised?.uncertainty)),
        upstreamUncertainty: stats(rows.map((r) => r.upstreamUncertainty)),
        combinedUncertainty: stats(rows.map((r) => r.combinedUncertainty)),
        absoluteError: target
          ? null
          : stats(
              rows
                .filter((r) => r.revised)
                .map((r) => Math.abs(r.revised.offset - r.truth)),
            ),
      },
      elapsedMs: stats(rows.map((r) => r.elapsedMs)),
      fastestRttMs: stats(rows.map((r) => r.fastestRttMs)),
      rows,
    },
    null,
    2,
  ),
);
