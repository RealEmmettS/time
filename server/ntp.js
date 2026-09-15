// Copyright QubeTX — tikset.com
import dgram from "node:dgram";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

const NTP_EPOCH_SECONDS = 2_208_988_800;
const ERA_SECONDS = 2 ** 32;

export function readTimestamp(packet, at, nearUnixMs) {
  const seconds = packet.readUInt32BE(at);
  const fraction = packet.readUInt32BE(at + 4) / ERA_SECONDS;
  const nearNtp = nearUnixMs / 1000 + NTP_EPOCH_SECONDS;
  const era = Math.round((nearNtp - seconds) / ERA_SECONDS);
  return (seconds + era * ERA_SECONDS - NTP_EPOCH_SECONDS + fraction) * 1000;
}

export function parseReply(packet, request, { sent, received, nearUnixMs }) {
  if (packet.length < 48 || packet.length > 512)
    throw new Error("Invalid NTP packet length");
  const leap = packet[0] >> 6;
  const version = (packet[0] >> 3) & 7;
  if ((packet[0] & 7) !== 4 || ![3, 4].includes(version) || leap === 3)
    throw new Error("Unsynchronized or invalid NTP response");
  if (packet[1] === 0) throw new Error("NTP server requested backoff");
  if (packet[1] > 15) throw new Error("Invalid NTP stratum");
  if (!packet.subarray(24, 32).equals(request.subarray(40, 48)))
    throw new Error("Uncorrelated NTP response");
  if (
    packet.subarray(32, 40).every((v) => v === 0) ||
    packet.subarray(40, 48).every((v) => v === 0)
  )
    throw new Error("Missing NTP timestamps");
  const s2 = readTimestamp(packet, 32, nearUnixMs);
  const s3 = readTimestamp(packet, 40, nearUnixMs);
  const elapsed = received - sent;
  const processing = s3 - s2;
  if (
    elapsed < 0 ||
    elapsed > 1500 ||
    processing < 0 ||
    processing > elapsed + 1
  )
    throw new Error("Inconsistent NTP timing");
  const rootDelay = (packet.readInt32BE(4) / 65536) * 1000;
  const rootDispersion = (packet.readUInt32BE(8) / 65536) * 1000;
  const precision = 2 ** packet.readInt8(3) * 1000;
  if (
    !Number.isFinite(precision) ||
    precision > 1000 ||
    rootDispersion > 1000 ||
    Math.abs(rootDelay) > 1000
  )
    throw new Error("NTP source uncertainty is too large");
  const delay = Math.max(0, elapsed - processing);
  const offset = (s2 - sent + (s3 - received)) / 2;
  const uncertainty =
    delay / 2 +
    Math.max(0, rootDelay) / 2 +
    rootDispersion +
    Math.max(1, precision);
  return {
    offset,
    uncertainty,
    measuredAt: received,
    rtt: elapsed,
    processing,
    delay,
    rootDelay,
    rootDispersion,
    stratum: packet[1],
    leap,
  };
}

export function queryCloudflare({
  createSocket = () => dgram.createSocket("udp4"),
  monotonic = () => performance.now(),
  wall = () => Date.now(),
} = {}) {
  return new Promise((resolve, reject) => {
    const socket = createSocket();
    const request = Buffer.alloc(48);
    request[0] = 0x23; // NTPv4 client; a random transmit cookie is echoed as origin.
    randomBytes(8).copy(request, 40);
    let finished = false;
    let sent;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* A failed bind may never open the socket. */
      }
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () => finish(new Error("NTP request timed out")),
      1500,
    );
    socket.on("error", (error) => finish(error));
    socket.on("message", (packet) => {
      const received = monotonic();
      try {
        finish(
          null,
          parseReply(packet, request, { sent, received, nearUnixMs: wall() }),
        );
      } catch (error) {
        finish(error);
      }
    });
    // Connected UDP socket restricts replies to the selected Cloudflare peer.
    try {
      socket.connect(123, "time.cloudflare.com", () => {
        if (finished) return;
        try {
          sent = monotonic();
          socket.send(request, (error) => {
            if (error) finish(error);
          });
        } catch (error) {
          finish(error);
        }
      });
    } catch (error) {
      finish(error);
    }
  });
}
