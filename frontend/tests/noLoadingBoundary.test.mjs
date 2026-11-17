// #156: a loading.tsx boundary makes Next stream a page into hidden
// placeholders that only an inline script reveals, so browsers without
// JavaScript (and some crawlers) see the skeleton forever. Public pages have
// none; client navigations show <LinkPending /> on the links instead.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(relative(root, p));
  }
  return out;
}

test("no loading boundary in the app (pages render without JavaScript)", () => {
  const loading = files(join(root, "app")).filter((p) => /(^|\/)loading\.(tsx|ts|jsx|js)$/.test(p));
  assert.deepEqual(loading, []);
});

test("menu and pagination links show a pending dot", () => {
  for (const f of ["components/NavMenuList.tsx", "components/Pagination.tsx"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /<LinkPending \/>/, f);
  }
});

// #362: unmounting a <Drawer> removes the <dialog> before it can close(), so
// focus can't return to the opener. Keep it mounted and drive it with `open`.
test("no component conditionally mounts a Drawer", () => {
  const bad = [...files(join(root, "components")), ...files(join(root, "app"))]
    .filter((p) => /\.tsx$/.test(p))
    .filter((p) => /&&\s*\(?\s*<Drawer\b/.test(readFileSync(join(root, p), "utf8")));
  assert.deepEqual(bad, []);
});
