// Copyright QubeTX - tikset.com
import assert from "node:assert/strict";
import test from "node:test";
import { selectSources } from "../src/source-selection.js";
import { DriftTracker } from "../src/drift-tracker.js";
import { createTimeApi } from "../server/time-api.js";
import { queryNtp } from "../server/ntp.js";
const report = (name, offset, uncertainty = 10) => ({
  endpoint: { name },
  offset,
  uncertainty,
  measuredAt: 0,
});

test("Cloudflare stays preferred despite a narrower agreeing source", () => {
  const cf = report("Cloudflare via Vercel", 0, 20),
    nist = report("NIST via Vercel", 1, 5);
  const result = selectSources([cf, nist, report("third", 2)], 0);
  assert.equal(result.selected, cf);
  assert.equal(result.selected.uncertainty, 20);
});
test("unique majority excludes a faulty Cloudflare reference and preserves full error", () => {
  const result = selectSources(
    [
      report("Cloudflare via Vercel", 1000),
      report("NIST", 0),
      report("third", 2),
      report("fourth", -2),
    ],
    0,
  );
  assert.equal(result.rejected[0].endpoint.name, "Cloudflare via Vercel");
  assert.equal(result.members.length, 3);
  assert.equal(result.selected.uncertainty, 10);
});
test("two-way disagreement and tied source clusters remain ambiguous", () => {
  assert.equal(selectSources([report("a", 0), report("b", 1000)], 0), null);
  assert.equal(
    selectSources(
      [report("a", 0), report("b", 0), report("c", 1000), report("d", 1000)],
      0,
    ),
    null,
  );
});
test("duplicates and observation-only providers cannot manufacture a majority", () => {
  const a = report("a", 0);
  assert.equal(selectSources([a, a, report("b", 1000)], 0), null);
  const observer = report("smear", 1000);
  observer.endpoint.observeOnly = true;
  assert.equal(
    selectSources([report("a", 0), report("b", 0), observer], 0).members.length,
    2,
  );
});
const driftSample = (i, rate = 50e-6, uncertainty = 1) => ({
  at: i * 60000,
  offset: 100000 + i * 60000 * rate,
  uncertainty,
  source: "Cloudflare",
  supported: true,
});
test("rate correction requires eleven minutes plus three successful predictions", () => {
  const tracker = new DriftTracker();
  for (let i = 0; i < 14; i++)
    assert.equal(tracker.add(driftSample(i)).active, false);
  assert.ok(tracker.add(driftSample(14)).active);
  assert.ok(tracker.status().rate > 45e-6 && tracker.status().rate <= 50e-6);
});
test("known positive and negative drift improves held-out time estimates", () => {
  for (const rate of [-80e-6, -30e-6, 30e-6, 80e-6]) {
    const tracker = new DriftTracker();
    for (let i = 0; i < 20; i++) tracker.add(driftSample(i, rate));
    const model = tracker.status();
    assert.ok(model.active);
    const trueAdvance = 60000 * rate,
      prediction = 60000 * model.rate;
    assert.ok(Math.abs(trueAdvance - prediction) < Math.abs(trueAdvance) / 10);
  }
});
test("uncertain, zero, oscillating, or excessive drift never changes clock speed", () => {
  for (const mode of ["wide", "zero", "jitter", "tooFast"]) {
    const tracker = new DriftTracker();
    for (let i = 0; i < 32; i++) {
      const s = driftSample(
        i,
        mode === "zero" ? 0 : mode === "tooFast" ? 500e-6 : 50e-6,
        mode === "wide" ? 100 : 1,
      );
      if (mode === "jitter") s.offset += i % 2 ? 50 : -50;
      assert.equal(tracker.add(s).active, false);
    }
  }
});
test("source changes, lost agreement and suspend gaps reset drift history", () => {
  for (const kind of ["source", "gap", "unsupported"]) {
    const tracker = new DriftTracker();
    for (let i = 0; i < 16; i++) tracker.add(driftSample(i));
    const next = driftSample(16);
    if (kind === "source") next.source = "NIST";
    if (kind === "gap") next.at += 300000;
    if (kind === "unsupported") next.supported = false;
    assert.equal(tracker.add(next).active, false);
    assert.ok(tracker.status().samples <= 1);
  }
});
test("repeated manual checks cannot accelerate drift qualification", () => {
  const tracker = new DriftTracker();
  for (let i = 0; i < 100; i++)
    tracker.add({ ...driftSample(0), at: i * 1000 });
  assert.equal(tracker.status().active, false);
  assert.ok(tracker.status().samples <= 3);
});
test("NIST route uses one cached upstream sample and rate-limits early clock invalidation", async () => {
  let mono = 0,
    wall = 0,
    calls = 0;
  const api = createTimeApi({
    now: () => mono,
    wall: () => wall,
    ntp: async ({ host }) => {
      assert.equal(host, "time.nist.gov");
      calls++;
      return { offset: 1700000000000, uncertainty: 5, measuredAt: mono };
    },
  });
  const req = new Request(
    "https://tikset.test/api/time?source=nist&requestId=nist-1",
  );
  const responses = await Promise.all(
    Array.from({ length: 9 }, () => api(req)),
  );
  assert.equal(calls, 1);
  const data = await responses[0].json();
  assert.equal(data.source.name, "time.nist.gov");
  assert.equal(data.requestId, "nist-1");
  mono = 1000;
  wall = 2000;
  assert.equal((await api(req)).status, 503);
  assert.equal(calls, 1);
  mono = 61000;
  wall = 62000;
  assert.equal((await api(req)).status, 200);
  assert.equal(calls, 2);
  assert.equal(
    (await api(new Request("https://tikset.test/api/time?source=attacker")))
      .status,
    400,
  );
});
test("UDP destinations are fixed and reject arbitrary remote hosts", async () => {
  await assert.rejects(queryNtp({ host: "127.0.0.1" }), /Unsupported/);
});
