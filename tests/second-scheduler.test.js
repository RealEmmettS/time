// Copyright QubeTX — tikset.com
import test from "node:test";
import assert from "node:assert/strict";
import { SecondScheduler } from "../src/second-scheduler.js";

test("native scheduling functions are invoked without a foreign receiver", () => {
  const names = [
    "setTimeout",
    "clearTimeout",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const original = new Map(names.map((name) => [name, globalThis[name]]));
  const calls = [];
  let callback;
  try {
    for (const name of names)
      globalThis[name] = function (fn) {
        assert.ok(
          this === undefined || this === globalThis,
          "native Window method cannot receive the scheduler as this",
        );
        calls.push(name);
        if (typeof fn === "function") callback = fn;
        return 1;
      };
    const scheduler = new SecondScheduler({
      now: () => 950,
      render: () => {},
      visible: () => true,
    });
    scheduler.start();
    callback();
    scheduler.stop();
    assert.ok(calls.includes("requestAnimationFrame"));
    assert.ok(calls.includes("cancelAnimationFrame"));
  } finally {
    for (const [name, fn] of original) {
      if (fn === undefined) delete globalThis[name];
      else globalThis[name] = fn;
    }
  }
});

function fixture(start = 950) {
  let time = start;
  let nextId = 0;
  let visible = true;
  const events = new Map();
  const rendered = [];
  const schedule = (fn, delay) => {
    const id = ++nextId;
    events.set(id, { fn, due: time + delay });
    return id;
  };
  const clock = new SecondScheduler({
    now: () => time,
    monotonic: () => time,
    render: (value) => rendered.push(value),
    visible: () => visible,
    setTimer: schedule,
    clearTimer: (id) => events.delete(id),
    frame: (fn) => schedule(fn, 1000 / 60),
    cancelFrame: (id) => events.delete(id),
  });
  const advance = (target) => {
    for (;;) {
      const pending = [...events].sort((a, b) => a[1].due - b[1].due)[0];
      if (!pending || pending[1].due > target) break;
      events.delete(pending[0]);
      time = Math.max(time, pending[1].due);
      pending[1].fn();
    }
    time = target;
  };
  return {
    clock,
    events,
    rendered,
    advance,
    block: (ms) => {
      time += ms;
    },
    hide: () => {
      visible = false;
    },
    show: () => {
      visible = true;
    },
  };
}
test("visible second boundaries render within one frame without accumulated drift", () => {
  const { clock, rendered, advance } = fixture();
  clock.start();
  advance(61000);
  for (const value of rendered.slice(1)) assert.ok(value % 1000 < 17);
  assert.ok(rendered.length >= 60);
  assert.ok(clock.getMetrics().frameCadence.median < 17);
});
test("main-thread stall skips to current second and recovers next boundary", () => {
  const { clock, rendered, advance, block } = fixture();
  clock.start();
  block(2250);
  advance(4000);
  assert.ok(rendered[1] >= 3200);
  advance(5020);
  assert.ok(rendered.at(-1) >= 5000 && rendered.at(-1) < 5017);
  assert.ok(clock.getMetrics().callbackLateness.max > 2000);
});
test("background ticks resume immediately and refresh cancels stale frames", () => {
  const { clock, events, rendered, advance, hide, show } = fixture();
  clock.start();
  hide();
  clock.refresh();
  advance(3000);
  assert.equal(rendered.at(-1), 3000);
  show();
  clock.refresh();
  assert.equal(events.size, 1);
  clock.stop();
  assert.equal(events.size, 0);
});
test("day rollover uses absolute time, including skipped minutes", () => {
  const { clock, rendered, advance, block } = fixture(86399950);
  clock.start();
  advance(86400020);
  assert.equal(Math.floor(rendered.at(-1) / 1000), 86400);
  block(120000);
  clock.refresh();
  assert.equal(Math.floor(rendered.at(-1) / 60000), 1442);
});
