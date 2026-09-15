// Copyright QubeTX — tikset.com
import test from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, CLOCK_HELP } from "../src/clock-help.js";

test("select desktop OS using available browser hints", () => {
  assert.equal(
    detectPlatform({ userAgentData: { platform: "Windows" } }),
    "windows",
  );
  assert.equal(detectPlatform({ platform: "Win32" }), "windows");
  assert.equal(detectPlatform({ platform: "MacIntel" }), "macos");
  assert.equal(detectPlatform({ platform: "Linux x86_64" }), "linux");
});
test("mobile, desktop-mode iPad, ChromeOS and unknown browsers do not get incorrect desktop commands", () => {
  assert.equal(detectPlatform({ userAgent: "Linux; Android 15" }), "mobile");
  assert.equal(
    detectPlatform({ platform: "MacIntel", maxTouchPoints: 5 }),
    "mobile",
  );
  assert.equal(
    detectPlatform({ platform: "Linux", userAgent: "CrOS x86_64" }),
    "unknown",
  );
  assert.equal(detectPlatform({}), "unknown");
});
test("all desktop guides explain optional source configuration and have official sources", () => {
  for (const id of ["windows", "macos", "linux"]) {
    assert.ok(CLOCK_HELP[id].links.length);
    assert.match(JSON.stringify(CLOCK_HELP[id]), /time.cloudflare.com/);
  }
});
