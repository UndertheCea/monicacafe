// Site icons (#114). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

test("favicon.ico, icon.svg and apple-icon.png exist in app/ with the right formats", () => {
  const ico = readFileSync(join(root, "app", "favicon.ico"));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], "ICO header");
  assert.ok(ico.readUInt16LE(4) >= 2, "several sizes");
  const png = readFileSync(join(root, "app", "apple-icon.png"));
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
  assert.equal(png.readUInt32BE(16), 180, "180 px wide");
  assert.equal(png.readUInt32BE(20), 180, "180 px high");
  const svg = readFileSync(join(root, "app", "icon.svg"), "utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svg, /<text|font-family|href=/, "drawn as paths: no fonts or external refs");
});

test("the CSP proxy skips the icon files (static, no nonce needed)", () => {
  const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
  for (const f of ["favicon.ico", "icon.svg", "apple-icon.png"]) assert.ok(proxy.includes(`|${f}|`), f);
});

test("smoke.sh checks every icon through nginx", () => {
  const smoke = readFileSync(join(root, "..", "scripts", "smoke.sh"), "utf8");
  for (const f of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) assert.match(smoke, new RegExp(`icon_check ${f.replace(".", "\\.")} `), f);
});
