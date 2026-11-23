// Copyright QubeTX — tikset.com
import test from "node:test";
import assert from "node:assert/strict";
import {
  fuseIntervals,
  intervalsAgree,
  parseUtc,
  refineResolution,
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
test("a slow probe distinguishes missed startup ticks from a coarse or frozen clock", async () => {
  let now = 0;
  const sleep = async () => {
    now += 4;
  };
  assert.equal(await refineResolution(() => now, sleep), 4);
  assert.equal(
    await refineResolution(() => Math.floor(now / 100) * 100, sleep),
    100,
  );
  assert.equal(await refineResolution(() => 0, sleep), 100);
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
  stampHeader,
  mutate = (data) => data,
  resolution = 1,
} = {}) {
  const state = {
    mono: 0,
    wallError,
    calls: 0,
    bad: new Set(bad),
    biases,
    inbound: 10,
    outbound: 10,
  };
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
      state.mono += state.outbound;
      const receivedAt = epoch + state.mono + state.biases[index];
      state.mono += 3;
      const sentAt = epoch + state.mono + state.biases[index];
      state.mono += state.inbound;
      const data = mutate(
        {
          version: 1,
          requestId: new URL(url, "https://tikset.test").searchParams.get(
            "requestId",
          ),
          receivedAt,
          sentAt,
          timestamp: sentAt,
        },
        index,
      );
      return {
        ok: true,
        headers: new Headers(
          stampHeader ? { "X-Tikset-Sent-At": stampHeader(sentAt) } : {},
        ),
        text: async () => {
          state.mono += bodyDelay;
          return JSON.stringify(data);
        },
      };
    },
  });
  return { state, clock, epoch, endpoints };
}

function ntpFixture(wallError = 0) {
  const f = fixture({
    biases: [0, 0],
    wallError,
    mutate: (d, i) => ({
      ...d,
      source: {
        name: i ? "time.nist.gov" : "time.cloudflare.com",
        protocol: "NTP",
        ageMs: 0,
        uncertaintyMs: 2,
      },
    }),
  });
  f.endpoints[0].upstream = true;
  f.endpoints[1].upstream = "time.nist.gov";
  return f;
}

test("a corroborated recent burst prevents a noisy refresh from moving the display", async () => {
  const { clock, state, epoch } = ntpFixture();
  const first = await clock.sync();
  state.mono += 55_000;
  state.inbound = 200;
  state.outbound = 50;
  const noisy = await clock.sync();
  assert.equal(noisy.agreeingNtp, 2);
  assert.equal(clock.nowMs(), epoch + state.mono);
  assert.ok(noisy.sampleAge > 55_000 && noisy.age < 3000);
  assert.ok(noisy.uncertainty > first.uncertainty + 5);
  assert.ok(noisy.uncertainty < 30);
  state.mono += 55_000;
  const later = await clock.sync();
  assert.equal(later.age, later.sampleAge);
  assert.equal(clock.nowMs() - (epoch + state.mono), -75);
  assert.ok(later.uncertainty > 100);
});
test("a new consistent shift supersedes history and a failed peer prevents carryover", async () => {
  const { clock, state, epoch } = ntpFixture();
  await clock.sync();
  state.mono += 55_000;
  state.biases = [500, 500];
  await clock.sync();
  assert.equal(clock.nowMs(), epoch + state.mono + 500);
  state.mono += 55_000;
  state.bad.add(1);
  state.inbound = 200;
  const single = await clock.sync();
  assert.equal(single.agreeingNtp, 1);
  assert.equal(single.age, single.sampleAge);
  assert.match(describeClock(single).action, /before adjusting/);
});
test("OS sync advice requires the whole range and spaced, corroborated checks", async () => {
  const { clock, state } = ntpFixture(-300);
  const first = await clock.sync();
  assert.match(describeClock(first).action, /next minute/);
  const rapid = await clock.sync({ crossCheck: true });
  assert.equal(rapid.repeatedMinimum, 0);
  state.mono += 55_000;
  const confirmed = await clock.sync();
  assert.match(describeClock(confirmed).action, /Two checks/);
  state.wallError = 0;
  assert.match(describeClock(clock.getStatus()).action, /within a tenth/);
  clock.invalidate("Device clock changed");
  state.wallError = 300;
  assert.match(describeClock(await clock.sync()).action, /next minute/);
  state.wallError = -3000;
  assert.match(describeClock(clock.getStatus()).action, /at least one second/);
});
test("watch advice responds to tick lateness and incomplete or coarse timing", async () => {
  const { clock } = ntpFixture();
  const info = await clock.sync();
  assert.match(describeClock(info).watch, /change to the next second/);
  assert.match(
    describeClock(info, { callbackLateness: { count: 10, p95: 150 } }).watch,
    /ran late/,
  );
  assert.match(
    describeClock({ ...info, uncertainty: 150 }).watch,
    /steadier connection/,
  );
  assert.match(
    describeClock({ ...info, status: "conflict" }).watch,
    /Wait for a fresh/,
  );
});
test("a wide agreeing peer cannot confirm an OS correction", async () => {
  const { clock, state } = ntpFixture(-1200);
  const fetcher = clock.fetcher;
  clock.fetcher = async (url) => {
    const response = await fetcher(url);
    const data = JSON.parse(await response.text());
    if (data.source.name === "time.nist.gov") data.source.uncertaintyMs = 1500;
    return Response.json(data);
  };
  await clock.sync();
  state.mono += 60_000;
  const info = await clock.sync();
  assert.equal(info.agreeingNtp, 2);
  assert.equal(info.corroboratedMinimum, 0);
  assert.equal(info.repeatedMinimum, 0);
  assert.doesNotMatch(describeClock(info).action, /Run your operating system/);
});
test("a seconds-only public timestamp cannot claim millisecond precision", async () => {
  const { clock } = fixture();
  const endpoint = ENDPOINTS[2];
  clock.fetcher = async () =>
    Response.json({ utc_datetime: "2026-11-23T01:00:00Z" });
  const coarse = await clock._syncEndpoint(endpoint, 2);
  assert.ok(coarse.uncertainty >= 1000);
  clock.fetcher = async () =>
    Response.json({ utc_datetime: "2026-11-23T01:00:00.000Z" });
  clock.sleep = async () => {};
  assert.ok((await clock._syncEndpoint(endpoint, 2)).uncertainty < 10);
});

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
  assert.match(describeClock(clock.getStatus()).summary, /on-time clock/);
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
test("older servers without a timestamp header use full body receipt", async () => {
  const { clock, endpoints } = fixture({ bodyDelay: 200 });
  const sample = await clock._sample(endpoints[0]);
  assert.equal(sample.rtt, 223);
  assert.ok(sample.upper - sample.lower >= 220);
});
test("a matching timestamp header removes body delay from the corrected reference", async () => {
  const legacy = fixture({ bodyDelay: 200 });
  const revised = fixture({ bodyDelay: 200, stampHeader: String });
  for (const { clock } of [legacy, revised]) await clock.sync();
  const error = ({ clock, epoch, state }) =>
    clock.nowMs() - (epoch + state.mono);
  assert.equal(error(legacy), -100);
  assert.equal(error(revised), 0);
  assert.equal(revised.clock.getStatus().rtt, 23);
  assert.equal(revised.clock.getStatus().offset, 1000);
  assert.ok(
    revised.clock.getStatus().uncertainty <
      legacy.clock.getStatus().uncertainty,
  );
});
test("a stamped reply must still pass correlation, body and deadline checks", async () => {
  for (const options of [
    { stampHeader: () => "1" },
    { stampHeader: String, mutate: (d) => ({ ...d, requestId: "old" }) },
    { stampHeader: String, bodyDelay: 3001 },
  ]) {
    const { clock, endpoints } = fixture(options);
    await assert.rejects(clock._sample(endpoints[0]));
  }
});
test("two successes in eight attempts cannot publish a reference", async () => {
  const { clock, endpoints } = fixture();
  const sample = clock._sample.bind(clock);
  let calls = 0;
  clock._sample = async (endpoint) => {
    if (++calls > 3) throw new Error("Network failure");
    return sample(endpoint);
  };
  await assert.rejects(clock._syncEndpoint(endpoints[0], 8), /Insufficient/);
});
test("the device comparison brackets a delayed wall-clock read", async () => {
  const { clock, state, epoch } = fixture({ wallError: 0 });
  await clock.sync();
  clock.wall = () => {
    state.mono += 40;
    const value = epoch + state.mono;
    state.mono += 40;
    return value;
  };
  const info = clock.getStatus();
  assert.equal(info.offset, 0);
  assert.equal(
    info.offsetUncertainty,
    info.uncertainty + info.wallResolution + 40,
  );
});
test("computer-clock summaries round bounds outward and qualify direction and freshness", async () => {
  const { clock } = fixture();
  const base = await clock.sync();
  for (const [offset, range] of [
    [6, "5 ms ahead to 17 ms behind"],
    [40, "29 ms to 51 ms behind"],
    [-40, "29 ms to 51 ms ahead"],
    [-1024, "1.013 s to 1.035 s ahead"],
  ]) {
    const copy = describeClock({ ...base, offset, offsetUncertainty: 10.2 });
    assert.ok(copy.summary.includes(range));
    if (offset === 6) assert.equal(copy.headline, "Within measurement range");
  }
  assert.doesNotMatch(
    describeClock({ ...base, status: "conflict" }).summary,
    /ahead|behind/,
  );
});
test("coarse timer produces suitably coarse diagnostics", async () => {
  const { clock } = fixture({ resolution: 100, wallError: -50 });
  await clock.sync();
  assert.ok(clock.getStatus().uncertainty >= 200);
  assert.match(describeClock(clock.getStatus()).summary, /on-time clock/);
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
  const { clock } = fixture({ biases: [0, 1000, 2000] });
  await clock.sync();
  assert.equal(clock.status, "conflict");
  assert.equal(clock.reference, null);
});
test("source conflict retains the prior reference and can recover", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  const previous = clock.reference;
  state.biases[1] = 1000;
  state.biases[2] = 2000;
  await clock.sync({ crossCheck: true });
  assert.equal(clock.reference, previous);
  assert.equal(clock.status, "conflict");
  state.biases[1] = 0;
  state.biases[2] = 0;
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
test("returning after four hours starts fresh while an old body is still pending", async () => {
  const { clock, state, epoch } = fixture();
  await clock.sync();
  const fetcher = clock.fetcher;
  const entered = Promise.withResolvers();
  const oldBody = Promise.withResolvers();
  clock.fetcher = async (url, options) => {
    const response = await fetcher(url, options);
    return {
      ...response,
      text: () => {
        entered.resolve(options.signal);
        return oldBody.promise;
      },
    };
  };
  const old = clock.sync();
  const oldSignal = await entered.promise;
  state.mono += 4 * 60 * 60_000;
  state.wallError += 20_000;
  clock.fetcher = fetcher;
  clock.invalidate("Returning to the clock");
  const fresh = clock.sync({ crossCheck: true });
  assert.notEqual(fresh, old);
  assert.equal(oldSignal.aborted, true);
  assert.equal(clock.checkContinuity(), false);
  assert.equal(describeClock(clock.getStatus()).fresh, false);
  await fresh;
  assert.equal(clock.status, "synced");
  assert.equal(clock.nowMs(), epoch + state.mono);
  assert.equal(clock.getStatus().offset, -state.wallError);
  const reference = clock.reference;
  oldBody.resolve("{}");
  await old;
  assert.equal(clock.reference, reference);
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
test("a timed-out check releases the status and automatically retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { clock } = fixture();
  const sleep = clock.sleep;
  const entered = Promise.withResolvers();
  const suspended = Promise.withResolvers();
  clock.sleep = () => {
    entered.resolve();
    return suspended.promise;
  };
  clock.startAutoSync();
  const stalled = clock._inFlight;
  await entered.promise;
  t.mock.timers.tick(45_000);
  await stalled;
  assert.equal(clock.status, "error");
  assert.match(clock.issue, /timed out/);
  assert.equal(clock._inFlight, null);
  clock.sleep = sleep;
  t.mock.timers.tick(10_000);
  await clock._inFlight;
  assert.equal(clock.status, "synced");
  suspended.resolve();
  clock.stopAutoSync();
});
test("fresh network samples recover four hours missing from the elapsed clock", async () => {
  const { clock, state, epoch } = fixture({ wallError: -275 });
  await clock.sync();
  const elapsedDuringSleep = 4 * 60 * 60_000;
  state.wallError += elapsedDuringSleep;
  state.biases.fill(elapsedDuringSleep);
  clock.invalidate("Returning after suspension");
  assert.equal(describeClock(clock.getStatus()).fresh, false);
  const fresh = await clock.sync({ crossCheck: true });
  assert.equal(clock.nowMs(), epoch + state.mono + elapsedDuringSleep);
  assert.equal(fresh.offset, 275);
  assert.equal(fresh.status, "synced");
});
test("a delayed timer callback cannot let an over-budget burst publish a reference", async () => {
  const { clock, state } = fixture();
  const sleep = clock.sleep;
  clock.sleep = async (ms) => {
    clock.sleep = sleep;
    state.mono += 60_000 + ms;
  };
  await clock.sync();
  assert.equal(clock.status, "error");
  assert.equal(clock.reference, null);
  assert.match(clock.issue, /timed out/);
});
test("an optional source that hangs cannot hold up a usable reference", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { clock, endpoints } = fixture();
  endpoints[2].protocol = false;
  const fetcher = clock.fetcher;
  const entered = Promise.withResolvers();
  clock.fetcher = (url, options) => {
    if (!url.startsWith(endpoints[2].url)) return fetcher(url, options);
    entered.resolve(options.signal);
    return new Promise(() => {});
  };
  const check = clock.sync();
  const signal = await entered.promise;
  t.mock.timers.tick(3500);
  const info = await check;
  assert.equal(signal.aborted, true);
  assert.equal(info.status, "synced");
  assert.equal(info.samplesUsed, 8);
  assert.ok(
    info.checks.find((report) => report.endpoint === endpoints[2]).error,
  );
});
test("offline invalidation cannot start a queued network request", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  const check = clock.sync();
  clock.sync({ crossCheck: true });
  clock.invalidate("Offline");
  const calls = state.calls;
  await check;
  assert.equal(clock.status, "stale");
  assert.equal(state.calls, calls);
  assert.equal(clock._inFlight, null);
  assert.equal(clock.getStatus().agreeingNtp, 0);
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
  assert.equal(response.headers.get("x-tikset-sent-at"), String(data.sentAt));
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

test("bad primary is replaced only by a fresh majority with eight reference samples", async () => {
  const { clock } = fixture({ biases: [1000, 0, 0] });
  await clock.sync();
  const info = clock.getStatus();
  assert.equal(info.status, "synced");
  assert.notEqual(info.endpoint.name, "source0");
  assert.equal(info.samplesTotal, 8);
  assert.deepEqual(info.rejectedSources, ["source0"]);
});
test("isolated comparison outlier is disclosed without abandoning a sound reference", async () => {
  const { clock, endpoints } = fixture({ biases: [0, 1000, 0] });
  endpoints[0].name = "Cloudflare via Vercel";
  await clock.sync();
  assert.equal(clock.getStatus().endpoint.name, "Cloudflare via Vercel");
  assert.deepEqual(clock.getStatus().rejectedSources, ["source1"]);
});
test("the tighter NTP source gets a full burst and leads the next automatic check", async () => {
  const { clock, state, endpoints } = fixture({
    mutate: (data, i) => ({
      ...data,
      source: {
        name: i === 0 ? "time.cloudflare.com" : "time.nist.gov",
        protocol: "NTP",
        uncertaintyMs: i === 0 ? 80 : 3,
        ageMs: 0,
      },
    }),
  });
  endpoints[0].upstream = true;
  endpoints[1].upstream = "time.nist.gov";
  let info = await clock.sync();
  assert.equal(info.endpoint, endpoints[1]);
  assert.equal(info.samplesUsed, 8);
  assert.equal(state.calls, 24);
  state.mono += 60000;
  info = await clock.sync();
  assert.equal(info.endpoint, endpoints[1]);
  assert.equal(state.calls, 36);
});
test("an automatic disagreement refreshes votes before replacing the reference", async () => {
  const { clock, state } = fixture();
  await clock.sync();
  state.mono += 60000;
  state.biases = [1000, 1000, 1000];
  await clock.sync();
  assert.equal(clock.getStatus().status, "synced");
  assert.equal(clock.getStatus().rejectedSources.length, 0);
  assert.ok(clock.getStatus().checks.every((r) => r.measuredAt > 60000));
});
test("active rate correction keeps device steps independent and retains the original uncertainty envelope", async () => {
  const { clock, state, epoch } = fixture();
  await clock.sync();
  clock.reference.rate = 50e-6;
  state.mono += 60000;
  assert.ok(Math.abs(clock.nowMs() - (epoch + state.mono + 3)) < 0.01);
  const corrected = clock.nowMs();
  state.wallError += 60000;
  assert.equal(clock.nowMs(), corrected);
  assert.ok(clock.getStatus().uncertainty >= clock.reference.uncertainty + 9);
  clock.invalidate("resume");
  assert.equal(clock.nowMs(), corrected);
  assert.equal(clock.drift.status().active, false);
});
