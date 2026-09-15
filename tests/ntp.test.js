// Copyright QubeTX — tikset.com
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { parseReply, queryCloudflare, readTimestamp } from "../server/ntp.js";
import {
  createReferenceClock,
  createTimeHandler,
} from "../server/reference-clock.js";

function writeTimestamp(packet, at, ms) {
  const seconds = ms / 1000 + 2_208_988_800;
  packet.writeUInt32BE(Math.floor(seconds) >>> 0, at);
  packet.writeUInt32BE(
    Math.floor((seconds - Math.floor(seconds)) * 2 ** 32) >>> 0,
    at + 4,
  );
}
function packetPair(epoch = Date.UTC(2026, 8, 15)) {
  const request = Buffer.alloc(48, 1);
  const packet = Buffer.alloc(48);
  packet[0] = 0x24;
  packet[1] = 3;
  packet.writeInt8(-20, 3);
  packet.writeInt32BE(Math.round(0.01 * 65536), 4);
  packet.writeUInt32BE(Math.round(0.002 * 65536), 8);
  request.copy(packet, 24, 40, 48);
  writeTimestamp(packet, 32, epoch + 10);
  writeTimestamp(packet, 40, epoch + 12);
  return {
    request,
    packet,
    epoch,
    timing: { sent: 0, received: 22, nearUnixMs: epoch },
  };
}
test("NTP packet separates both path delay and upstream root error", () => {
  const { request, packet, timing, epoch } = packetPair();
  const result = parseReply(packet, request, timing);
  assert.ok(Math.abs(result.offset - epoch) < 0.001);
  assert.ok(Math.abs(result.delay - 20) < 0.001);
  assert.ok(result.uncertainty > 17 && result.uncertainty < 19);
});
test("NTP timestamp decoding survives the 2036 era rollover", () => {
  const epoch = Date.UTC(2040, 0, 1);
  const { packet } = packetPair(epoch);
  assert.ok(Math.abs(readTimestamp(packet, 32, epoch) - (epoch + 10)) < 0.001);
});
test("reject KoD, unsynchronized, wrong mode/version, missing stamps, and unrelated replies", () => {
  for (const mutate of [
    (p) => {
      p[1] = 0;
    },
    (p) => {
      p[1] = 16;
    },
    (p) => {
      p[0] |= 0xc0;
    },
    (p) => {
      p[0] = 0x23;
    },
    (p) => {
      p[0] = 0x14;
    },
    (p) => {
      p[24] ^= 1;
    },
    (p) => p.fill(0, 40, 48),
    (p) => p.writeUInt32BE(65536 * 20, 8),
  ]) {
    const { request, packet, timing } = packetPair();
    mutate(packet);
    assert.throws(() => parseReply(packet, request, timing));
  }
  const { request, timing } = packetPair();
  assert.throws(() => parseReply(Buffer.alloc(20), request, timing));
});
test("UDP client connects only to Cloudflare and closes after a correlated response", async () => {
  const socket = new EventEmitter();
  let closed = false;
  let mono = 0;
  const epoch = Date.UTC(2026, 8, 15);
  socket.connect = (port, host, callback) => {
    assert.equal(port, 123);
    assert.equal(host, "time.cloudflare.com");
    callback();
  };
  socket.close = () => {
    closed = true;
  };
  socket.send = (request) => {
    const { packet } = packetPair(epoch);
    request.copy(packet, 24, 40, 48);
    mono = 22;
    queueMicrotask(() => socket.emit("message", packet));
  };
  const result = await queryCloudflare({
    createSocket: () => socket,
    monotonic: () => mono,
    wall: () => epoch,
  });
  assert.ok(closed);
  assert.ok(Math.abs(result.offset - epoch) < 0.001);
});
test("UDP socket error closes the socket and rejects", async () => {
  const socket = new EventEmitter();
  let closed = false;
  socket.connect = () =>
    queueMicrotask(() => socket.emit("error", new Error("UDP unavailable")));
  socket.close = () => {
    closed = true;
  };
  await assert.rejects(
    queryCloudflare({ createSocket: () => socket }),
    /UDP unavailable/,
  );
  assert.ok(closed);
});

test("synchronous UDP connect and send failures close the socket", async () => {
  for (const operation of ["connect", "send"]) {
    const socket = new EventEmitter();
    let closed = false;
    socket.close = () => {
      closed = true;
    };
    socket.connect = (_port, _host, callback) => callback();
    socket[operation] = () => {
      throw new Error("socket failure");
    };
    await assert.rejects(
      queryCloudflare({ createSocket: () => socket }),
      /socket failure/,
    );
    assert.ok(closed);
  }
});

test("synchronous upstream failure can recover after backoff", async () => {
  let mono = 0;
  const clock = createReferenceClock({
    query: () => {
      if (!mono) throw new Error("offline");
      return sample();
    },
    now: () => mono,
    wall: () => mono,
  });
  await assert.rejects(clock.get(), /offline/);
  mono = 60000;
  assert.ok(await clock.get());
});

const sample = (offset = 1_700_000_000_000) => ({
  offset,
  uncertainty: 10,
  measuredAt: 0,
  delay: 5,
  rootDelay: 8,
  rootDispersion: 1,
  stratum: 3,
  leap: 0,
});
test("upstream reference deduplicates concurrent work and expires cache", async () => {
  let calls = 0,
    mono = 0;
  const clock = createReferenceClock({
    query: async () => {
      calls++;
      return { ...sample(), measuredAt: mono };
    },
    now: () => mono,
    wall: () => 100000 + mono,
  });
  const [a, b] = await Promise.all([clock.get(), clock.get()]);
  assert.equal(a, b);
  assert.equal(calls, 3);
  mono += 59999;
  await clock.get();
  assert.equal(calls, 3);
  mono += 1;
  await clock.get();
  assert.equal(calls, 6);
});
test("upstream rejects inconsistent samples and backs off after failure", async () => {
  let calls = 0,
    mono = 0;
  const clock = createReferenceClock({
    query: async () => sample(++calls % 2 ? 1000 : 2000),
    now: () => mono,
    wall: () => mono,
  });
  await assert.rejects(clock.get(), /disagree/);
  await assert.rejects(clock.get(), /temporarily unavailable/);
  assert.equal(calls, 3);
  mono += 60000;
  await assert.rejects(clock.get(), /disagree/);
  assert.equal(calls, 6);
});
test("backend wall-clock change invalidates cached reference", async () => {
  let calls = 0,
    wall = 0;
  const clock = createReferenceClock({
    query: async () => {
      calls++;
      return sample();
    },
    now: () => 0,
    wall: () => wall,
  });
  await clock.get();
  wall += 10000;
  await clock.get();
  assert.equal(calls, 6);
});
test("upstream failure returns 503 rather than labeling host time as Cloudflare", async () => {
  const handler = createTimeHandler({
    now: () => 0,
    get: async () => {
      throw new Error("offline");
    },
  });
  const response = await handler();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).timestamp, undefined);
});
test("API timestamps use upstream monotonic mapping across slow cold refresh", async () => {
  let mono = 0;
  const handler = createTimeHandler({
    now: () => mono,
    get: async () => {
      mono = 1000;
      return sample();
    },
  });
  const result = await (await handler()).json();
  assert.equal(result.receivedAt, sample().offset);
  assert.equal(result.sentAt, sample().offset + 1000);
  assert.equal(result.source.uncertaintyMs, 10.1);
});
