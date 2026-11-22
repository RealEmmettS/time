// Copyright QubeTX — tikset.com
import assert from "node:assert/strict";
import test from "node:test";
import { previewHeaders } from "../scripts/preview-headers.mjs";

const origin = "https://preview.example";
const target = new URL("/api/time", origin);
const cookie = "preview=test-value";

test("the preview credential is sent only to its configured HTTPS origin", () => {
  assert.deepEqual(
    previewHeaders(target, "https://PREVIEW.example:443/", cookie),
    {
      Cookie: cookie,
    },
  );
  for (const other of [
    "https://other.example",
    "https://preview.example.other.example",
    "https://preview.example:8443",
    "http://preview.example",
    "http://localhost",
  ]) {
    assert.deepEqual(previewHeaders(new URL(other), origin, cookie), {});
  }
});

test("benchmarking stays anonymous without both credential settings", () => {
  assert.deepEqual(previewHeaders(target, undefined, cookie), {});
  assert.deepEqual(previewHeaders(target, origin, undefined), {});
});

test("the trusted setting must identify an HTTPS origin", () => {
  for (const invalid of [
    "http://preview.example",
    origin + "/path",
    "preview.example",
  ]) {
    assert.throws(() => previewHeaders(target, invalid, cookie));
  }
});
