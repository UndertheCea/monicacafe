// #260: every runtime dependency is imported by the site's own code, so unused packages can't creep back in
// (framer-motion, zustand and @tanstack/react-query sat in package.json unused until 2026-11-13).
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

// Needed at runtime without being imported by name: peers of a package we do import, or loaded by Next itself.
const implicit = new Map([
  ["graphql", "peer dependency of graphql-request"],
  ["react-dom", "rendered by Next"],
]);

async function sources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) out.push(...(await sources(url)));
    else if (/\.(tsx?|mjs|css)$/.test(entry.name)) out.push(await readFile(url, "utf8"));
  }
  return out;
}

const code = [
  ...(await sources(new URL("app/", root))),
  ...(await sources(new URL("components/", root))),
  ...(await sources(new URL("lib/", root))),
  await readFile(new URL("proxy.ts", root), "utf8"),
  await readFile(new URL("instrumentation.ts", root), "utf8"),
  await readFile(new URL("next.config.ts", root), "utf8"),
].join("\n");

function imported(name) {
  const quoted = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  // import … from "pkg" / "pkg/sub", import("pkg"), import "pkg/x.css"
  return new RegExp(`(from|import\\(?)\\s*["']${quoted}(/[^"']*)?["']`).test(code);
}

test("every runtime dependency is imported (or listed as implicit with a reason)", () => {
  const unused = Object.keys(pkg.dependencies).filter((name) => !implicit.has(name) && !imported(name));
  assert.deepEqual(unused, [], `remove unused dependencies: ${unused.join(", ")}`);
});

test("implicit dependencies are still installed", () => {
  for (const name of implicit.keys()) assert.ok(pkg.dependencies[name], `${name} is listed as implicit but not a dependency`);
});

test("the detector sees real imports and ignores absent ones", () => {
  assert.ok(imported("next"));
  assert.ok(imported("leaflet"));
  assert.ok(!imported("framer-motion"));
  assert.ok(!imported("zustand"));
});
