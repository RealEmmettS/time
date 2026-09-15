// Copyright QubeTX — tikset.com
import test from "node:test";
import assert from "node:assert/strict";
import {
  fuseIntervals,
  intervalsAgree,
  parseUtc,
  timerResolution,
  timingSample,
} from "../src/timing.js";
import { AtomicClockSync, ENDPOINTS } from "../src/atomic-sync.js";
import { describeClock } from "../src/diagnostics.js";
import { createTimeHandler } from "../server/reference-clock.js";

const intervals = (pairs) =>
  pairs.map(([lower, upper]) => ({ lower, upper, resolution: 0.01 }));
test("fusion selects the later stronger cluster (production regression)", () => {
  const result = fuseIntervals(
    intervals([
      [1, 3],
      [2, 4],
      [10, 15],
      [11, 14],
      [12, 13],
    ]),
  );
  assert.equal(result.offset, 12.5);
  assert.equal(result.uncertainty, 0.5);
  assert.equal(result.samplesUsed, 3);
});
test("zero, negative, nested and touching intervals", () => {
  assert.equal(
    fuseIntervals(
      intervals([
        [-2, 2],
        [-1, 1],
      ]),
    ).offset,
    0,
  );
  assert.equal(
    fuseIntervals(
      intervals([
        [-8, -2],
        [-6, -4],
      ]),
    ).offset,
    -5,
  );
  assert.equal(
    fuseIntervals(
      intervals([
        [-1, 0],
        [0, 1],
      ]),
    ).offset,
    0,
  );
});
test("reject disjoint, tied majorities, and insufficient samples", () => {
  assert.equal(
    fuseIntervals(
      intervals([
        [1, 2],
        [3, 4],
      ]),
    ),
    null,
  );
  assert.equal(
    fuseIntervals(
      intervals([
        [0, 10],
        [1, 2],
        [8, 9],
      ]),
    ),
    null,
  );
  assert.equal(fuseIntervals(intervals([[1, 2]])), null);
  assert.equal(fuseIntervals([]), null);
});
test("quantization floor survives very narrow intersections", () => {
  assert.equal(
    fuseIntervals([
      { lower: -1, upper: 1, resolution: 100 },
      { lower: 0, upper: 2, resolution: 100 },
    ]).uncertainty,
    200,
  );
});
test("four timestamps remove server processing from path delay", () => {
  const sample = timingSample({
    sent: 0,
    received: 70,
    serverReceived: 1010,
    serverSent: 1060,
  });
  assert.equal(sample.offset, 1000);
  assert.equal(sample.delay, 20);
  assert.equal(sample.processing, 50);
  assert.equal(sample.rtt, 70);
});
test("asymmetric paths retain the true offset inside the interval", () => {
  for (const [outbound, inbound] of [
    [1, 99],
    [99, 1],
    [30, 30],
  ]) {
    const sample = timingSample({
      sent: 0,
      received: outbound + inbound,
      serverReceived: 1000 + outbound,
      serverSent: 1000 + outbound,
    });
    assert.ok(sample.lower <= 1000 && sample.upper >= 1000);
  }
});
test("reject reversed, nonfinite, impossible processing and excessively late samples", () => {
  for (const change of [
    { received: -1 },
    { received: Infinity },
    { serverSent: 900 },
    { serverSent: 2000 },
    { received: 3001 },
  ]) {
    assert.throws(() =>
      timingSample({
        sent: 0,
        received: 20,
        serverReceived: 1000,
        serverSent: 1000,
        ...change,
      }),
    );
  }
});
test("ISO parsing retains fractional milliseconds and rejects non-UTC input", () => {
  assert.ok(
    Math.abs(
      parseUtc("2026-09-15T00:00:00.123456Z") -
        (Date.parse("2026-09-15T00:00:00Z") + 123.456),
    ) < 0.001,
  );
  assert.ok(Number.isNaN(parseUtc("2026-09-15T00:00:00")));
  assert.ok(Number.isNaN(parseUtc("invalid")));
});
test("timer probe handles coarse or frozen clocks conservatively", () => {
  assert.equal(
    timerResolution(() => 0, 10),
    100,
  );
  let n = 0;
  assert.equal(
    timerResolution(() => ++n * 100, 10),
    100,
  );
});
test("cross-source comparison includes elapsed oscillator allowance", () => {
  const a = { offset: 0, uncertainty: 2, measuredAt: 0 };
  const b = { ...a, offset: 10 };
  assert.equal(intervalsAgree(a, b, 0), false);
  assert.equal(intervalsAgree(a, b, 60_000), true);
});

function fixture({
  wallError = -1000,
  biases = [0, 0, 0],
  bad = [],
  bodyDelay = 0,
  mutate = (data) => data,
  resolution = 1,
} = {}) {
  const state = { mono: 0, wallError, calls: 0, bad: new Set(bad), biases };
  const epoch = 1_789_430_400_000;
  const endpoints = biases.map((_, i) => ({
    name: `source${i}`,
    url: `https://source${i}.test/api/time`,
    protocol: true,
  }));
  const clock = new AtomicClockSync({
    monotonic: () => state.mono,
    wall: () => epoch + state.mono + state.wallError,
    resolution,
    wallResolution: resolution,
    endpoints,
    sleep: async (ms) => {
      state.mono += ms;
    },
    fetcher: async (url) => {
      state.calls++;
      const index = endpoints.findIndex((e) => url.startsWith(e.url));
      if (state.bad.has(index)) throw new Error("Timed out");
      state.mono += 10;
      const receivedAt = epoch + state.mono + state.biases[index];
      state.mono += 3;
      const sentAt = epoch + state.mono + state.biases[index];
      state.mono += 10;
      const data = mutate({
        version: 1,
        requestId: new URL(url, "https://tikset.test").searchParams.get(
          "requestId",
        ),
        receivedAt,
        sentAt,
        timestamp: sentAt,
      });
      return {
        ok: true,
        headers: new Headers(),
        text: async () => {
          state.mono += bodyDelay;
          return JSON.stringify(data);
        },
      };
    },
  });
  return { state, clock, epoch, endpoints };
}

test("known positive and negative device errors do not change reference time", async () => {
  for (const wallError of [-1000, 1000, -86_400_000, 0]) {
    const { clock, state, epoch } = fixture({ wallError });
    await clock.sync();
    assert.equal(clock.nowMs(), epoch + state.mono);
    assert.equal(clock.getStatus().offset, -wallError || 0);
    assert.equal(clock.getStatus().agreement, "agree");
    assert.equal(clock.getStatus().samplesUsed, 8);
  }
});
test("OS correction after sync changes diagnosis without jumping reference", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  const before = clock.nowMs();
  state.wallError = 0;
  assert.equal(clock.nowMs(), before);
  assert.equal(clock.getStatus().offset, 0);
  assert.match(describeClock(clock.getStatus()).summary, /No clock difference/);
});
test("OS clock correction during sampling cannot corrupt the reference", async () => {
  const { clock, state, epoch } = fixture();
  clock.sleep = async (ms) => {
    state.mono += ms;
    state.wallError += 10_000;
  };
  await clock.sync();
  assert.equal(clock.nowMs(), epoch + state.mono);
});
test("body receipt is included in the interval", async () => {
  const { clock, endpoints } = fixture({ bodyDelay: 200 });
  const sample = await clock._sample(endpoints[0]);
  assert.equal(sample.rtt, 223);
  assert.ok(sample.upper - sample.lower >= 220);
});
test("coarse timer produces suitably coarse diagnostics", async () => {
  const { clock } = fixture({ resolution: 100, wallError: -50 });
  await clock.sync();
  assert.ok(clock.getStatus().uncertainty >= 200);
  assert.match(describeClock(clock.getStatus()).summary, /No clock difference/);
});
test("wrong request identifiers and protocol versions are rejected", async () => {
  for (const mutate of [
    (d) => ({ ...d, requestId: "replayed" }),
    (d) => ({ ...d, version: 2 }),
    (d) => ({ ...d, timestamp: 0 }),
  ]) {
    const { clock, endpoints } = fixture({ mutate });
    await assert.rejects(clock._sample(endpoints[0]));
  }
});
test("failed initial sync shows uncorrected device time", async () => {
  const { clock } = fixture({ bad: [0, 1, 2] });
  await clock.sync();
  assert.equal(clock.getStatus().hasReference, false);
  assert.equal(clock.status, "error");
  assert.equal(describeClock(clock.getStatus()).headline, "Device time");
});
test("fallback source works and a single source is qualified", async () => {
  const { clock } = fixture({ bad: [0, 2] });
  await clock.sync();
  assert.equal(clock.getStatus().endpoint.name, "source1");
  assert.equal(clock.getStatus().agreement, "single");
  assert.match(describeClock(clock.getStatus()).summary, /Relative to source1/);
});
test("source conflict on startup does not publish a reference", async () => {
  const { clock } = fixture({ biases: [0, 1000, 0] });
  await clock.sync();
  assert.equal(clock.status, "conflict");
  assert.equal(clock.reference, null);
});
test("source conflict retains the prior reference and can recover", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  const previous = clock.reference;
  state.biases[1] = 1000;
  await clock.sync({ crossCheck: true });
  assert.equal(clock.reference, previous);
  assert.equal(clock.status, "conflict");
  state.biases[1] = 0;
  await clock.sync({ crossCheck: true });
  assert.equal(clock.status, "synced");
});
test("failed refresh keeps reference with stale status; subsequent refresh recovers", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  const previous = clock.reference;
  state.bad = new Set([0, 1, 2]);
  await clock.sync();
  assert.equal(clock.reference, previous);
  assert.equal(clock.status, "stale");
  assert.equal(describeClock(clock.getStatus()).fresh, false);
  state.bad.clear();
  await clock.sync();
  assert.equal(clock.status, "synced");
});
test("age grows uncertainty and expires freshness without a wall-clock dependency", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  const uncertainty = clock.getStatus().uncertainty;
  state.mono += 100_000;
  state.wallError -= 100_000;
  assert.equal(clock.getStatus().status, "stale");
  assert.ok(clock.getStatus().uncertainty >= uncertainty + 10);
});
test("automatic syncs are deduplicated", async () => {
  const { clock, state } = fixture();
  const first = clock.sync();
  const second = clock.sync();
  assert.equal(first, second);
  await first;
  assert.equal(state.calls, 15);
});
test("manual full check queued during primary refresh is honored", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  state.calls = 0;
  const refreshing = clock.sync();
  clock.sync({ crossCheck: true });
  await refreshing;
  assert.equal(state.calls, 24);
});
test("invalidated in-flight result cannot overwrite reference", async () => {
  const { clock } = fixture();
  let completed = 0;
  clock.addEventListener("statuschange", (e) => {
    if (e.detail.status === "synced") completed++;
  });
  const operation = clock.sync();
  clock.invalidate("Sleep detected");
  await operation;
  assert.equal(completed, 1);
  assert.equal(clock.status, "synced");
});
test("continuity detects OS steps and suspend with either timer behavior", async () => {
  for (const change of [
    (s) => {
      s.wallError += 10000;
    },
    (s) => {
      s.mono += 60000;
    },
    (s) => {
      s.wallError += 60000;
    },
  ]) {
    const { clock, state } = fixture();
    await clock.sync();
    clock.checkContinuity();
    change(state);
    assert.equal(clock.checkContinuity(), true);
    await clock._inFlight;
    assert.equal(clock.status, "synced");
  }
});
test("API returns versioned correlated uncached Cloudflare timestamps and legacy field", async () => {
  const GET = createTimeHandler({
    now: () => 10,
    get: async () => ({
      offset: 1_700_000_000_000,
      uncertainty: 5,
      measuredAt: 10,
      delay: 4,
      rootDelay: 2,
      rootDispersion: 1,
      stratum: 3,
      leap: 0,
    }),
  });
  const response = await GET(
    new Request("https://tikset.com/api/time?requestId=test-123"),
  );
  const data = await response.json();
  assert.equal(data.version, 1);
  assert.equal(data.requestId, "test-123");
  assert.equal(data.timestamp, data.sentAt);
  assert.equal(data.source.name, "time.cloudflare.com");
  assert.equal(data.source.uncertaintyMs, 5);
  assert.ok(data.receivedAt <= data.sentAt);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal((await (await GET()).json()).requestId, null);
});

test("upstream uncertainty is retained after browser sample fusion", async () => {
  const { clock, endpoints } = fixture({
    mutate: (data) => ({
      ...data,
      source: {
        name: "time.cloudflare.com",
        protocol: "NTP",
        uncertaintyMs: 15,
        ageMs: 100,
      },
    }),
  });
  Object.assign(endpoints[0], ENDPOINTS[0]);
  await clock.sync();
  const info = clock.getStatus();
  assert.equal(info.upstreamUncertainty, 15);
  assert.ok(info.uncertainty >= info.networkUncertainty + 15);
});
test("missing upstream metadata rejects the Cloudflare endpoint", async () => {
  const { clock, endpoints } = fixture();
  Object.assign(endpoints[0], ENDPOINTS[0]);
  await clock.sync();
  assert.equal(clock.getStatus().endpoint.name, "source1");
});
